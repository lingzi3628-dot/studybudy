// Quick check — are the plugin flags actually enabled?
async function main() {
  const { isPluginFrameworkEnabled } = await import("../src/lib/tutor/plugin-framework");
  const { isPluginFirstOrchestrationEnabled } = await import("../src/lib/tutor/plugin-orchestrator");

  console.log("TUTOR_PLUGIN_FRAMEWORK_ENABLED         =", isPluginFrameworkEnabled());
  console.log("TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED =", isPluginFirstOrchestrationEnabled());

  const fcFlag = (process.env.TUTOR_FLOWCHART_GENERATION_ENABLED ?? "false").toLowerCase().trim();
  console.log("TUTOR_FLOWCHART_GENERATION_ENABLED     =", fcFlag === "true" || fcFlag === "1" || fcFlag === "on");

  if (!isPluginFrameworkEnabled() || !isPluginFirstOrchestrationEnabled()) {
    console.log("\n❌ At least one flag is OFF.");
    console.log("   Accepted values: 'true', '1', 'on' (case-insensitive).");
    console.log("   'enabled' does NOT work.");
  } else {
    console.log("\n✅ All plugin flags are ON. Plugins should be active.");
  }
}
main();
