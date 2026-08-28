import { start } from "./app.js";

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
