import { html } from "htm/react";
import { useRef } from "react";

const ShowRoomKey = ({ isVisible, onClose, roomKey }) => {
  const popupContentRef = useRef(null);

  // check if the click was outside the popup content
  const handleOverlayClick = (e) => {
    if (
      popupContentRef.current &&
      !popupContentRef.current.contains(e.target)
    ) {
      onClose();
    }
  };
  if (!isVisible) return;

  return html` <div className="popup-overlay" onClick=${handleOverlayClick}>
    <div
      className="popup-content"
      ref=${popupContentRef}
      style=${{ backgroundColor: "grey" }}
    >
      <button className="popup-close" onClick=${onClose}>x</button>
      <h2>Room Key:</h2>
      <p className="room-key">${roomKey}</p>
      <p>Share this key with a peer so they can join the room.</p>
      <button
        id="save-this-or-all"
        className="button-square button-save"
        onClick=${() => {
          onClose();
        }}
      >
        Close
      </button>
    </div>
  </div>`;
};

export default ShowRoomKey;
