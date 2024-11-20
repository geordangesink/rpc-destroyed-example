// PeersView.js
import { html } from "htm/react";
import { useState } from "react";
import { jsonToMap } from "../api/json-map-switch.js";
import { useSchedule } from "../context/ScheduleContext.js";
import useIsVisible from "../hooks/useIsVisible.js";
import ShowRoomKey from "./ShowRoomKey";
import sodium from "sodium-native";

const PeersView = () => {
  const { isVisible, handleMakeVisible, handleMakeInvisible } = useIsVisible(); // visibility of create activity pop-up
  const {
    calendarFolderRef,
    calendarTopicRef,
    calendarNameRef,
    setCurrentSchedule,
    addPeer,
    initSharedDB,
    sharedDbObject,
  } = useSchedule();
  const [searchPeer, setSearchPeer] = useState();

  const createCalendarFolderKey = async () => {
    const key = Buffer.alloc(32);
    sodium.randombytes_buf(key);

    calendarNameRef.current = key.toString("hex");
    calendarFolderRef.current = key.toString("hex");
  };

  const handleNewCalendar = async () => {
    createCalendarFolderKey().then(initSharedDB).then(handleMakeVisible);
  };

  const handleJoinCalendar = async () => {
    let bee = false;
    let folder;

    // check if topic is already stored in db tracker
    for (const key in sharedDbObject) {
      const calendarFull = sharedDbObject[key];
      if (calendarFull.topic === searchPeer) {
        bee = calendarFull.bee;
        folder = key;
        break;
      }
    }

    if (!bee) {
      createCalendarFolderKey().then(() => initSharedDB(searchPeer));
      console.log("joined calendar db on topic:", searchPeer);
    } else {
      calendarFolderRef.current = folder;
      console.log("calendar already exists... Opening...");
      console.log(bee);

      const schedule = await bee.get("schedule");
      console.log(schedule);
      if (
        schedule &&
        schedule.value &&
        Object.keys(schedule.value).length !== 0
      ) {
        setCurrentSchedule(jsonToMap(schedule.value.toString()));
        console.log(jsonToMap(schedule.value.toString()));
      } else {
        setCurrentSchedule(new Map());
      }
    }
  };

  const handleAddWriter = async () => {
    addPeer(searchPeer);
  };

  return html`
    <section className="peers">
      <section className="join-or-create">
        <button className="square-button" onClick=${handleJoinCalendar}>
          Join Calendar
        </button>

        <button className="square-button" onClick=${handleNewCalendar}>
          Create Calendar
        </button>

        <button className="square-button" onClick=${handleAddWriter}>
          Add Writer to current
        </button>
      </section>

      <input
        type="text"
        placeholder="insert key (join or add writer)"
        onChange=${(e) => setSearchPeer(e.target.value)}
      />

      <${ShowRoomKey}
        isVisible=${isVisible}
        onClose=${handleMakeInvisible}
        roomKey=${calendarTopicRef.current}
        title="ShowRoomKey"
      >
      </${ShowRoomKey}>
    </section>
  `;
};

export default PeersView;
