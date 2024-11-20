import { html } from "htm/react";
import PeersView from "./components/PeersView.js";
import ScheduleProvider from "./context/ScheduleContext.js";
import ShowRoomKey from "./components/ShowRoomKey.js";

const App = () => {
  return html`
      <div className="container">
        <${ScheduleProvider}>
          <${PeersView} />
          <${ShowRoomKey} />
        </${ScheduleProvider}>
      </div>
  `;
};

export default App;
