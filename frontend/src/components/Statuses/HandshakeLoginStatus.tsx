import { InfoIcon } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type HandshakeSessionStatus,
  getHandshakeSessionStatus,
} from "../../api";
import { Button, message, Modal } from "antd";

export function HandshakeLoginStatus() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<HandshakeSessionStatus | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const showModal = () => {
    setIsModalOpen(true);
  };

  const handleOk = () => {
    setIsModalOpen(false);
  };

  const handleCancel = () => {
    setIsModalOpen(false);
  };

  const copyToken = () => {
    const token =
      typeof localStorage !== "undefined"
        ? (localStorage.getItem("token") ?? "")
        : "";
    navigator.clipboard.writeText(token).then(
      () => message.success("Token copied to clipboard."),
      () => message.error("Failed to copy token."),
    );
    return;
  };
  useEffect(() => {
    getHandshakeSessionStatus().then(setStatus);
  }, []);

  // if its connected and not expired, open for 3 seconds. If it's expired, leave it open until the user clicks the refresh button.
  useEffect(() => {
    if (status?.connected && !status.expired) {
      setOpen(true);
      setTimeout(() => setOpen(false), 3000);
    } else {
      setOpen(true);
    }
  }, [status]);

  if (!status || !open) return null;

  return (
    <div className="absolute right-4 bottom-4">
      <div className="w-60 p-4 bg-card rounded-lg border">
        <h1 className="text-lg font-bold">Handshake Status</h1>
        <p>{status.connected ? "🟢 Connected" : "🔴 Disconnected"}</p>
        <p>{status.expired ? "🔴 Expired" : "🟢 Not expired"}</p>
        {status.expired && (
          <Button
            type="link"
            className="flex items-center gap-2 text-sm text-muted"
            onClick={showModal}
          >
            How to connect? <InfoIcon className="w-4 h-4" />
          </Button>
        )}
      </div>
      <Modal
        title="How to connect to Handshake?"
        closable={{ "aria-label": "Custom Close Button" }}
        open={isModalOpen}
        onOk={handleOk}
        onCancel={handleCancel}
      >
        <ol type="1">
          <li>
            1. Open the browser extension or go to [link to extension] to
            install it
          </li>
          <li>2. Log in to Handshake in your browser</li>
          <li>
            4. Click this button to copy the token:{" "}
            <Button type="link" onClick={copyToken}>
              Copy token
            </Button>
          </li>
          <li>
            5. Paste the token into the extension and hit "Send Handshake
            session to app"
          </li>
          <li>
            6. Refresh the page and you should be able to connect to Handshake
          </li>
        </ol>
      </Modal>
    </div>
  );
}
