import { useToolContext, type ViewConfig } from "mcp-use/react";
import { MenuPanel } from "./Panel.js";
export const viewConfig = { preferredDisplayMode: "inline", displayModes: ["inline", "fullscreen"] } satisfies ViewConfig;
export default function MenuView() {
  const context = useToolContext<"explain_dishes">();
  if (context.status === "pending") return <div className="menulens"><p role="status">Opening MenuLens…</p></div>;
  if (context.status === "error") return <div className="menulens notice error" role="alert">{context.error.message}</div>;
  return <MenuPanel initial={context.toolOutput} />;
}
