import { html } from "htm/react";
import { createContext, useContext, useEffect, useState, useRef } from "react";
import { jsonToMap, mapToJson } from "../api/json-map-switch.js";
import Hyperbee from "hyperbee";
import Hypercore from "hypercore";
import Hyperswarm from "hyperswarm";
import Autobee from "../api/Autobee.js";
import Corestore from "corestore";
import c from "compact-encoding";
import b4a from "b4a";

const ScheduleContext = createContext();

const ScheduleProvider = ({ children }) => {
  const [currentSchedule, setCurrentSchedule] = useState(new Map());
  const [sharedDbObject, setSharedDbObject] = useState(new Object());
  const db = useRef(null);
  const swarm = useRef(new Hyperswarm());
  const calendarNameRef = useRef("My Calendar");
  const calendarFolderRef = useRef("MyCalendar");
  const calendarTopicRef = useRef("");

  Pear.teardown(async () => {
    await swarm.current.destroy();
  });

  useEffect(() => {
    closeDb().then(async () => {
      const personalBee = await initPersonalDB();
      await loadSharedDbs(personalBee);
    });
  }, []); // on start

  // clean-up
  const closeDb = async () => {
    if (db.current) {
      await db.current.close();
      console.log("db closed");
    } else {
      console.log("no db to close");
    }
  };

  // load personal DB (Hyperbee)
  const initPersonalDB = async () => {
    try {
      const storagePath = "./calendarStorage/MyCalendar";
      const core = new Hypercore(storagePath);
      await core.ready();

      const bee = new Hyperbee(core, {
        keyEncoding: "utf-8",
        valueEncoding: "binary",
      });
      await bee.ready();

      // fetch or init private schedule
      const result = await bee.get("schedule");
      if (result && result.value) {
        const scheduleMap = jsonToMap(result.value.toString());
        setCurrentSchedule(scheduleMap);
      } else {
        const newSchedule = new Map();
        setCurrentSchedule(newSchedule);
        await bee.put("schedule", Buffer.from(mapToJson(newSchedule)));
      }
      db.current = bee;

      return bee;
    } catch (error) {
      console.error("Error initializing Personal database:", error);
    }
  };

  // load selected shared DB
  const initSharedDB = async (
    dbTopic = undefined,
    folderKey = calendarFolderRef.current
  ) => {
    try {
      const storagePath = `./calendarStorage/${folderKey}`;
      const store = new Corestore(storagePath);
      await store.ready();

      const bee = new Autobee(store, dbTopic, {
        // applies operations from the batch (e.g., adding writers, handling messages)
        apply: async (batch, view, base) => {
          for (const node of batch) {
            const op = node.value;

            // Handling "updateSchedule" operation: update schedule between shared peers
            // DOESNT DO ANYTHIN IN EXAMPLE
            if (op.type === "updateSchedule") {
              const scheduleMap = jsonToMap(op.schedule);
              console.log("Schedule updated:", scheduleMap);
            }

            // Handling "addWriter" operation: adding a writer to the database
            if (op.type === "addWriter") {
              console.log("\rAdding writer", op.key);
              await base.addWriter(b4a.from(op.key, "hex"));
              continue;
            }
          }
          // Pass through to Autobee's default apply behavior
          await Autobee.apply(batch, view, base);
        },
        valueEncoding: c.any,
      }).on("error in Autobee", console.error);

      await bee.update(); // update shared db

      // set swarm topic depending if it is creating or joining a db
      let topic;
      if (dbTopic) {
        topic = b4a.from(dbTopic, "hex");
        console.log("Joining db on topic:", dbTopic);
      } else {
        topic = bee.local.key;
        console.log("Creating New db topic:", b4a.toString(topic, "hex"));
      }
      calendarTopicRef.current = b4a.toString(topic, "hex");
      await addNewCalendarToDb(bee);

      // join swarm
      swarm.current.join(topic, { announce: true, lookup: true });
      console.log("Joining swarm on topic:", b4a.toString(topic, "hex"));
      swarm.current.on("connection", (connection) => {
        bee.replicate(connection);
        console.log("new peer connected");
      });

      // Before appending, check if the current node is writable
      if (!bee.writable) {
        console.log(
          "This node is not writable. ask a writer node to add this key as writer...\n",
          b4a.toString(bee.local.key, "hex")
        );
      } else {
        console.log(
          "your are a writer node for this db",
          b4a.toString(bee.local.key, "hex")
        );
        console.log("the folder is:\n", calendarFolderRef.current);
      }

      // fetch or init the schedule
      const result = await bee.get("schedule");

      if (result && result.value) {
        const scheduleMap = jsonToMap(result.value.toString());
        await bee.put("schedule", Buffer.from(mapToJson(scheduleMap)));
        setCurrentSchedule(scheduleMap);
      } else {
        await bee.put("schedule", new Map());
        setCurrentSchedule(new Map());
      }

      return bee;
    } catch (error) {
      console.error("Error initializing Shared database:", error);
    }
  };

  // load and mount all shared db on first load
  // they are saved as [folderKey][dbKey] ...
  // topic key same as db key
  const loadSharedDbs = async (personalBee) => {
    console.log("loading shared dbs...");
    const data = await personalBee.get("sharedCalendars");
    if (data) {
      const dataMap = jsonToMap(data.value.toString());

      // mount every db onto state
      let dataObject = {};

      for (const [folderKey, innerMap] of dataMap) {
        const topic = innerMap.get("topic");

        const bee = await initSharedDB(topic, folderKey);

        dataObject[folderKey] = {
          topic,
          bee,
        };
      }
      setSharedDbObject(dataObject);
    } else {
      console.log("no shared calendars stored");
    }
  };

  const addNewCalendarToDb = async (bee) => {
    // add db to mounted shared DBs tracker state
    const dbObject = sharedDbObject;
    dbObject[calendarFolderRef.current] = {
      topic: b4a.toString(bee.local.key, "hex"),
      bee,
    };

    // store folder key and topic key in personal db
    let currentMapOfSharedDb = await db.current.get("sharedCalendars");
    if (!currentMapOfSharedDb) {
      currentMapOfSharedDb = new Map();
    } else {
      currentMapOfSharedDb = jsonToMap(currentMapOfSharedDb.value.toString());
    }
    const nameAndTopic = new Map([
      ["name", calendarNameRef.current],
      ["topic", calendarTopicRef.current],
    ]);
    currentMapOfSharedDb.set(calendarFolderRef.current, nameAndTopic);
    db.current.put(
      "sharedCalendars",
      Buffer.from(mapToJson(currentMapOfSharedDb))
    );

    setSharedDbObject(dbObject);
  };

  const addPeer = async (key) => {
    try {
      await sharedDbObject[calendarFolderRef.current].bee.append({
        type: "addWriter",
        key,
      });
      await sharedDbObject[calendarFolderRef.current].bee.update(); // Ensure the database processes the operation
      console.log(`Added writer: ${key}`);
    } catch (error) {
      console.error("Error adding writer:", error);
    }
  };

  // provide both the state and the functions to change it
  return html`
    <${ScheduleContext.Provider}
      value=${{
        db,
        calendarNameRef,
        calendarFolderRef,
        calendarTopicRef,
        currentSchedule,
        sharedDbObject,
        setCurrentSchedule,
        addPeer,
        initSharedDB,
        initPersonalDB,
      }}
    >
      ${children}
    </${ScheduleContext.Provider}>
  `;
};

export const useSchedule = () => {
  return useContext(ScheduleContext);
};

export default ScheduleProvider;
