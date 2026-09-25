// Registers ./resolve-relative-ts.mjs as a module customization hook.
// `node --import` alone runs a file as a preload script; it does not treat
// its exports as hooks. Registering explicitly is what actually activates
// the resolve() hook in resolve-relative-ts.mjs for the rest of the process.
import { register } from "node:module";

register("./resolve-relative-ts.mjs", import.meta.url);
