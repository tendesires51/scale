// bot.js — DEV PLAYTEST BOT
// Do NOT ship this to production

(function () {
  if (!window.BOT_MODE) return;

  console.log("[BOT] Bot mode active");

  const startTime = performance.now();
  const milestones = new Set();

  function log(name) {
    if (milestones.has(name)) return;
    milestones.add(name);
    const t = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log(`[BOT] ${name} @ ${t}s`);
  }

  window.botTick = function () {
    if (!window.botState) return;
    const s = botState();

    // Velocity → 5
    if (s.velocityLevel < 5 && window.buyVelocityUpgrade) {
      buyVelocityUpgrade();
      return;
    }

    // Acceleration → 5
    if (s.accelUnlocked && s.accelLevel < 5 && window.buyAccelUpgrade) {
      buyAccelUpgrade();
      return;
    }

    // Compression → 3
    if (s.compressionUnlocked && s.compressionLevel < 3 && window.buyCompressionUpgrade) {
      buyCompressionUpgrade();
      return;
    }

    // Unit Collapse
    if (s.canPrestige && window.unitCollapse) {
      log("Unit Collapse");
      unitCollapse();
      return;
    }

    // Unlock Mass
    if (s.scalePoints >= 1 && !s.massUnlocked && window.unlockMassGeneration) {
      unlockMassGeneration();
      log("Mass Unlocked");
      return;
    }

    // Spend Mass
    if (s.massUnlocked && s.mass.gte(100) && window.buyMassVelocityUpgrade) {
      buyMassVelocityUpgrade();
      return;
    }

    // Dimension Collapse
    if (s.canDimensionCollapse && window.dimensionCollapse) {
      log("Dimension Collapse");
      dimensionCollapse();
    }
  };
})();
