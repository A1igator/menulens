export function landingHtml(mode: "fixture" | "live") {
  if (mode === "fixture")
    return '<!doctype html><html><head><meta http-equiv="refresh" content="0;url=/mcp/_mcp-use/public/demo/index.html"><title>MenuLens</title></head><body><a href="/mcp/_mcp-use/public/demo/index.html">Open MenuLens demo</a></body></html>';
  return '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MenuLens</title><body style="font-family:system-ui;max-width:640px;margin:10vh auto;padding:24px;background:#f6f5ef;color:#173e32"><h1>MenuLens</h1><p>Your menu, understood.</p><p>Connect this server’s /mcp URL in ChatGPT developer mode. Ask MenuLens to pair your Android companion, then find your restaurant.</p><p>Location sharing is controlled in the Android companion. Dietary labels reflect published menu evidence.</p><a href="/mcp">Connector details</a></body></html>';
}
