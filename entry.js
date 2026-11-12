// Lifecycle exports expected by SillyTavern's extension manager.
import './index.js';
export function onActivate() { globalThis.storyChaosEngineLifecycle.activate(); }
export function onEnable() { globalThis.storyChaosEngineLifecycle.enable(); }
export function onDisable() { globalThis.storyChaosEngineLifecycle.disable(); }
export function onDelete() { globalThis.storyChaosEngineLifecycle.disable(); }
