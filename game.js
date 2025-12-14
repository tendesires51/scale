// ---- Core State ----
const GAME_VERSION = "pre-release 0.21"
let distance = new Decimal(0)
let distancePerSecond = new Decimal(1) // Start at 1 m/s
let scalePoints = new Decimal(0)

// Mass system (unlocks with first scale upgrade)
let mass = new Decimal(0)
let massPerSecond = new Decimal(0) // Starts at 0, unlocked by scale upgrade
let massUnlocked = false

// Dimension system (unlocks with Dimension Collapse scale upgrade)
let dimensionPoints = new Decimal(0)
let dimensionLevel = 0 // How many times you've bought the 4x dimension
let dimensionCost = new Decimal(1) // First dimension costs 1 DP
const dimensionCostMultiplier = 1 // Costs 1 DP each time
let dimensionCollapseUnlocked = false
let dimensionsTabUnlocked = false

// ---- UI State ----
let currentTab = 'main'
let scaleUpgradesUnlocked = false

// ---- Upgrades ----
let upgradeLevel = 0
let upgradeCost = new Decimal(10)
const upgradeCostMultiplier = 2.5

// Acceleration upgrade (unlocks at velocity level 5)
let accelLevel = 0
let accelCost = new Decimal(1000)
const accelCostMultiplier = 3
let accelUnlocked = false

// Distance Compression upgrade (unlocks at accel level 5)
let compressionLevel = 0
let compressionCost = new Decimal(1e7) // 10 million meters
const compressionCostMultiplier = 5
let compressionUnlocked = false

// ---- Mass-based Upgrades ----
// Mass Velocity upgrade (costs mass, boosts distance/sec)
let massVelocityLevel = 0
let massVelocityCost = new Decimal(100) // 100 grams
const massVelocityCostMultiplier = 3

// Enhanced Dimensions upgrade (costs 1 ton mass)
let enhancedDimensionsUnlocked = false

// ---- Scale Upgrades ----
// Unlock Mass Generation (costs 1 Scale Point)
let massGenerationUnlocked = false

// Auto Upgrade (costs 1 Scale Point)
let autoUpgradeUnlocked = false

// Triple Mass Generation (costs 1 Scale Point)
let tripleMassUnlocked = false

// Persistent Mass Upgrades (costs 2 Scale Points)
let persistentMassUpgrades = false

// ---- Units ----
const units = [
  { value: new Decimal(1), name: "m" },
  { value: new Decimal(1e3), name: "km" },
  { value: new Decimal(1.496e11), name: "AU" },
  { value: new Decimal(9.461e15), name: "ly" },
  { value: new Decimal(3.086e22), name: "Mpc" }
]

const massUnits = [
  { value: new Decimal(1), name: "g" },
  { value: new Decimal(1e3), name: "kg" },
  { value: new Decimal(1e6), name: "t" },
  { value: new Decimal(5.972e27), name: "M⊕" }, // Earth masses
  { value: new Decimal(1.989e33), name: "M☉" }  // Solar masses
]

// ---- Formatting ----
function formatDistance(value) {
  let unit = units[0]
  for (let i = units.length - 1; i >= 0; i--) {
    if (value.gte(units[i].value)) {
      unit = units[i]
      break
    }
  }

  return `${value.div(unit.value).toPrecision(4)} ${unit.name}`
}

function formatMass(value) {
  let unit = massUnits[0]
  for (let i = massUnits.length - 1; i >= 0; i--) {
    if (value.gte(massUnits[i].value)) {
      unit = massUnits[i]
      break
    }
  }

  return `${value.div(unit.value).toPrecision(4)} ${unit.name}`
}

// ---- Game Tick ----
let lastTime = Date.now()

// Fixed-timestep simulation (adjustable from Settings)
let tickRate = 60 // ticks/sec
let tickDt = 1 / tickRate
let tickAccumulator = 0

// Auto-save interval (adjustable from Settings)
let autoSaveInterval = 30 // seconds

function setTickRate(rate) {
  const r = Math.max(10, Math.min(60, Math.floor(Number(rate) || 60)))
  tickRate = r
  tickDt = 1 / tickRate

  const slider = document.getElementById('tickRate')
  const valueEl = document.getElementById('tickRateValue')
  if (slider) slider.value = String(tickRate)
  if (valueEl) valueEl.textContent = String(tickRate)

  saveGame()
}

// Called by the Settings range input
function onTickRateInput(value) {
  setTickRate(value)
}

function setAutoSaveInterval(seconds) {
  const s = Math.max(1, Math.min(60, Math.floor(Number(seconds) || 30)))
  autoSaveInterval = s

  const slider = document.getElementById('autoSaveInterval')
  const valueEl = document.getElementById('autoSaveIntervalValue')
  if (slider) slider.value = String(autoSaveInterval)
  if (valueEl) valueEl.textContent = String(autoSaveInterval)

  // Restart the autosave interval
  if (window.autoSaveIntervalId) {
    clearInterval(window.autoSaveIntervalId)
  }
  window.autoSaveIntervalId = setInterval(saveGame, autoSaveInterval * 1000)

  saveGame()
}

// Called by the Settings range input
function onAutoSaveIntervalInput(value) {
  setAutoSaveInterval(value)
}

// Make it accessible from console
window.setTickRate = setTickRate
window.setAutoSaveInterval = setAutoSaveInterval

function processTick(dt) {
  // Apply acceleration to increase base velocity
  const acceleration = calculateAcceleration()
  distancePerSecond = distancePerSecond.plus(acceleration.times(dt))

  // Calculate distance based on velocity and multipliers
  const totalMultiplier = calculateTotalMultiplier()
  distance = distance.plus(distancePerSecond.times(totalMultiplier).times(dt))

  // Generate mass if unlocked
  if (massUnlocked) {
    const massMultiplier = calculateMassMultiplier()
    mass = mass.plus(massPerSecond.times(massMultiplier).times(dt))
  }

  // Auto-buy upgrades if unlocked
  if (autoUpgradeUnlocked) {
    autoBuyUpgrades()
  }
}

function gameLoop() {
  try {
    const now = Date.now()
    const delta = (now - lastTime) / 1000
    lastTime = now

    // Fixed timestep simulation
    tickAccumulator += delta
    let steps = 0
    const maxSteps = 1000 // safety to prevent spiral-of-death
    while (tickAccumulator >= tickDt && steps < maxSteps) {
      processTick(tickDt)
      tickAccumulator -= tickDt
      steps++
    }

    // If we hit the safety cap, drop excess time so we don't freeze
    if (steps >= maxSteps) {
      tickAccumulator = 0
    }

    updateUI()
  } catch (error) {
    console.error('Game loop error:', error)
  }
  requestAnimationFrame(gameLoop)
}

// ---- Calculate Multipliers ----
function calculateTotalMultiplier() {
  let mult = new Decimal(1)

  // Velocity upgrade multiplier (2x per upgrade, softcapped at level 5)
  if (upgradeLevel <= 5) {
    mult = mult.times(Decimal.pow(2, upgradeLevel))
  } else {
    // First 5 levels: 2^5 = 32x
    // After level 5: reduced to 1.5x per level
    const baseMult = Decimal.pow(2, 5) // 32x from first 5 levels
    const softcappedLevels = upgradeLevel - 5
    const softcappedMult = Decimal.pow(1.5, softcappedLevels)
    mult = mult.times(baseMult).times(softcappedMult)
  }

  // Scale Points bonus (1.5x per scale point, softcapped after 5)
  if (scalePoints.lte(5)) {
    mult = mult.times(Decimal.pow(1.5, scalePoints.toNumber()))
  } else {
    // First 5 scale points: 1.5^5 = 7.59x
    // After 5: logarithmic softcap using sqrt
    const baseMult = Decimal.pow(1.5, 5) // 7.59x from first 5 points
    const extraPoints = scalePoints.minus(5).toNumber()
    const softcappedMult = Decimal.pow(1.5, Math.sqrt(extraPoints))
    mult = mult.times(baseMult).times(softcappedMult)
  }

  // Mass Velocity upgrade bonus (3x per level) - Applied LAST for maximum scaling
  // This multiplies ALL previous bonuses, making it extremely powerful
  if (massVelocityLevel > 0) {
    mult = mult.times(Decimal.pow(3, massVelocityLevel))
  }

  // Dimension multiplier - Applied after everything else
  const dimensionMult = calculateDimensionMultiplier()
  mult = mult.times(dimensionMult)

  return mult
}

// ---- Calculate Acceleration ----
function calculateAcceleration() {
  if (accelLevel === 0) return new Decimal(0)

  // Softcap acceleration after level 10
  if (accelLevel <= 10) {
    // 0.25 m/s² per level for first 10 levels
    return new Decimal(accelLevel).times(0.25)
  } else {
    // First 10 levels: 10 * 0.25 = 2.5 m/s²
    const baseAccel = new Decimal(10).times(0.25) // 2.5 m/s²
    // After level 10: reduced to 0.1 m/s² per level
    const softcappedLevels = accelLevel - 10
    const softcappedAccel = new Decimal(softcappedLevels).times(0.1)
    return baseAccel.plus(softcappedAccel)
  }
}

// ---- Calculate Compression Cost Reduction ----
function calculateCompressionDivision() {
  if (compressionLevel === 0) return new Decimal(1)

  // Logarithmic scaling: division = 2^(sqrt(level))
  // This gives: level 1 = ÷2, level 4 = ÷4, level 9 = ÷8, level 16 = ÷16, level 25 = ÷32
  // Each level gives diminishing returns
  const effectiveLevel = Math.sqrt(compressionLevel)
  return Decimal.pow(2, effectiveLevel)
}

// ---- Calculate Mass Generation Multiplier ----
function calculateMassMultiplier() {
  let mult = new Decimal(1)

  // Triple Mass upgrade
  if (tripleMassUnlocked) {
    mult = mult.times(3)
  }

  // Dimension multiplier
  const dimensionMult = calculateDimensionMultiplier()
  mult = mult.times(dimensionMult)

  return mult
}

// ---- Calculate Dimension Multiplier ----
function calculateDimensionMultiplier() {
  if (dimensionLevel === 0) return new Decimal(1)

  // Each dimension level gives 4x multiplier (or 6x if enhanced)
  const baseMultiplier = enhancedDimensionsUnlocked ? 6 : 4
  return Decimal.pow(baseMultiplier, dimensionLevel)
}

// ---- UI ----
function updateUI() {
  // Update main stats (runs at 60 FPS)
  const distanceEl = document.getElementById("distance")
  const rateEl = document.getElementById("rate")
  const scalePointsEl = document.getElementById("scalePoints")
  const dimensionPointsEl = document.getElementById("dimensionPoints")
  const massEl = document.getElementById("mass")
  const massRateEl = document.getElementById("massRate")

  if (!distanceEl || !rateEl || !scalePointsEl) return

  distanceEl.textContent = formatDistance(distance)

  const totalRate = distancePerSecond.times(calculateTotalMultiplier())
  rateEl.textContent = `+${formatDistance(totalRate)} / sec`

  scalePointsEl.textContent = `Scale Points: ${scalePoints.toString()}`

  // Update dimension points display if unlocked
  if (dimensionPointsEl) {
    if (dimensionsTabUnlocked) {
      dimensionPointsEl.style.display = 'block'
      dimensionPointsEl.textContent = `Dimension Points: ${dimensionPoints.toString()}`
    } else {
      dimensionPointsEl.style.display = 'none'
    }
  }

  // Update mass display if unlocked
  if (massEl && massRateEl) {
    if (massUnlocked) {
      massEl.style.display = 'block'
      massRateEl.style.display = 'block'
      massEl.textContent = formatMass(mass)
      const massMultiplier = calculateMassMultiplier()
      const totalMassRate = massPerSecond.times(massMultiplier)
      massRateEl.textContent = `+${formatMass(totalMassRate)} / sec`
    } else {
      massEl.style.display = 'none'
      massRateEl.style.display = 'none'
    }
  }

  // Update tab content
  if (currentTab === 'upgrades') {
    updateUpgradesTab()
  } else if (currentTab === 'scale') {
    updateScaleUpgradesTab()
  } else if (currentTab === 'dimensions') {
    updateDimensionsTab()
  }

  // Update prestige button (only on main tab)
  if (currentTab === 'main') {
    const prestigeBtn = document.getElementById("prestige")
    if (prestigeBtn) {
      const prestigeThreshold = new Decimal(1e9) // 1e6 km = 1e9 m
      const canPrestige = distance.gte(prestigeThreshold)
      prestigeBtn.disabled = !canPrestige

      // Calculate potential gain: floor(log10(distance) - 8)
      const scalePointsGain = canPrestige ? Decimal.floor(distance.log10() - 8) : new Decimal(0)
      prestigeBtn.textContent = `Unit Collapse ${canPrestige ? `[+${scalePointsGain} SP]` : '[1.000e6 km]'}`
    }

    // Update dimension collapse button
    const dimensionBtn = document.getElementById("dimensionCollapse")
    if (dimensionBtn) {
      if (dimensionCollapseUnlocked) {
        dimensionBtn.style.display = 'block'
        const dimensionThreshold = new Decimal(9.461e15) // 100 ly
        const canCollapse = distance.gte(dimensionThreshold)
        dimensionBtn.disabled = !canCollapse
        dimensionBtn.textContent = `Dimension Collapse ${canCollapse ? '[+1 DP]' : '[100 ly]'}`
      } else {
        dimensionBtn.style.display = 'none'
      }
    }
  }

  // Update Scale Upgrades tab visibility
  const scaleUpgradesTab = document.querySelector('.tab-btn[data-tab="scale"]')
  if (scaleUpgradesTab) {
    scaleUpgradesTab.style.display = scaleUpgradesUnlocked ? 'block' : 'none'
  }

  // Update Dimensions tab visibility
  const dimensionsTab = document.querySelector('.tab-btn[data-tab="dimensions"]')
  if (dimensionsTab) {
    dimensionsTab.style.display = dimensionsTabUnlocked ? 'block' : 'none'
  }
}

function updateUpgradesTab() {
  const compressionDivision = calculateCompressionDivision()

  // Update velocity upgrade
  const discountedVelocityCost = upgradeCost.div(compressionDivision)
  const canAffordUpgrade = distance.gte(discountedVelocityCost)
  const upgradeBtn = document.getElementById("velocityUpgrade")
  if (upgradeBtn) {
    upgradeBtn.disabled = !canAffordUpgrade
    upgradeBtn.querySelector('.upgrade-level').textContent = `Level ${upgradeLevel}${upgradeLevel >= 5 ? ' (Softcapped)' : ''}`
    upgradeBtn.querySelector('.upgrade-cost').textContent = formatDistance(discountedVelocityCost)

    // Calculate current and next effect based on softcap
    let currentEffect, nextEffect
    if (upgradeLevel < 5) {
      currentEffect = Decimal.pow(2, upgradeLevel)
      nextEffect = Decimal.pow(2, upgradeLevel + 1)
    } else if (upgradeLevel === 5) {
      currentEffect = Decimal.pow(2, 5)
      const nextBase = Decimal.pow(2, 5)
      nextEffect = nextBase.times(1.5)
    } else {
      const baseMult = Decimal.pow(2, 5)
      currentEffect = baseMult.times(Decimal.pow(1.5, upgradeLevel - 5))
      nextEffect = baseMult.times(Decimal.pow(1.5, upgradeLevel - 4))
    }

    upgradeBtn.querySelector('.upgrade-effect').textContent =
      `${currentEffect.toPrecision(4)}x → ${nextEffect.toPrecision(4)}x`
  }

  // Update acceleration upgrade (unlock at velocity level 5)
  const accelBtn = document.getElementById("accelUpgrade")
  if (accelBtn) {
    if (upgradeLevel >= 5) {
      accelUnlocked = true
      accelBtn.style.display = 'block'
      const discountedAccelCost = accelCost.div(compressionDivision)
      const canAffordAccel = distance.gte(discountedAccelCost)
      accelBtn.disabled = !canAffordAccel
      accelBtn.querySelector('.upgrade-level').textContent = `Level ${accelLevel}${accelLevel >= 10 ? ' (Softcapped)' : ''}`
      accelBtn.querySelector('.upgrade-cost').textContent = formatDistance(discountedAccelCost)

      // Calculate current and next acceleration with softcap
      const currentAccel = calculateAcceleration()
      let nextAccel
      if (accelLevel < 10) {
        nextAccel = new Decimal(accelLevel + 1).times(0.25)
      } else if (accelLevel === 10) {
        const baseAccel = new Decimal(10).times(0.25) // 2.5 m/s²
        nextAccel = baseAccel.plus(0.1) // 2.6 m/s²
      } else {
        const baseAccel = new Decimal(10).times(0.25)
        const softcappedLevels = accelLevel - 9
        nextAccel = baseAccel.plus(new Decimal(softcappedLevels).times(0.1))
      }

      accelBtn.querySelector('.upgrade-effect').textContent =
        `+${formatDistance(currentAccel)}/s² → +${formatDistance(nextAccel)}/s²`
    } else {
      accelBtn.style.display = 'none'
    }
  }

  // Update compression upgrade (unlock at accel level 5)
  const compressionBtn = document.getElementById("compressionUpgrade")
  if (compressionBtn) {
    if (accelLevel >= 5) {
      compressionUnlocked = true
      compressionBtn.style.display = 'block'
      const canAffordCompression = distance.gte(compressionCost)
      compressionBtn.disabled = !canAffordCompression
      compressionBtn.querySelector('.upgrade-level').textContent = `Level ${compressionLevel}`
      compressionBtn.querySelector('.upgrade-cost').textContent = formatDistance(compressionCost)

      // Calculate current and next compression division
      const currentDivision = calculateCompressionDivision()
      const nextLevel = compressionLevel + 1
      const nextEffectiveLevel = Math.log2(nextLevel + 1)
      const nextDivision = Decimal.pow(2, nextEffectiveLevel)

      compressionBtn.querySelector('.upgrade-effect').textContent =
        `/${currentDivision.toPrecision(4)} cost → /${nextDivision.toPrecision(4)} cost`
    } else {
      compressionBtn.style.display = 'none'
    }
  }

  // Update mass-based velocity upgrade (unlock when mass is unlocked)
  const massVelocityBtn = document.getElementById("massVelocityUpgrade")
  if (massVelocityBtn) {
    if (massUnlocked) {
      massVelocityBtn.style.display = 'block'
      const canAffordMassVelocity = mass.gte(massVelocityCost)
      massVelocityBtn.disabled = !canAffordMassVelocity
      massVelocityBtn.querySelector('.upgrade-level').textContent = `Level ${massVelocityLevel}`
      massVelocityBtn.querySelector('.upgrade-cost').textContent = formatMass(massVelocityCost)

      const currentEffect = massVelocityLevel === 0 ? new Decimal(1) : Decimal.pow(3, massVelocityLevel)
      const nextEffect = Decimal.pow(3, massVelocityLevel + 1)
      massVelocityBtn.querySelector('.upgrade-effect').textContent =
        `${currentEffect.toPrecision(4)}x → ${nextEffect.toPrecision(4)}x`
    } else {
      massVelocityBtn.style.display = 'none'
    }
  }

  // Update Enhanced Dimensions unlock (requires dimensions tab unlocked)
  const enhancedDimensionsBtn = document.getElementById("enhancedDimensionsUpgrade")
  if (enhancedDimensionsBtn) {
    if (dimensionsTabUnlocked) {
      enhancedDimensionsBtn.style.display = 'block'
      const cost = new Decimal(1e6) // 1 ton
      const canAfford = mass.gte(cost) && !enhancedDimensionsUnlocked
      enhancedDimensionsBtn.disabled = !canAfford || enhancedDimensionsUnlocked
      if (enhancedDimensionsUnlocked) {
        enhancedDimensionsBtn.textContent = 'Enhanced Dimensions Unlocked!'
      } else {
        // Reset to original HTML structure if not unlocked
        enhancedDimensionsBtn.innerHTML = `
          <div class="upgrade-name" style="color: #f8f;">Enhanced Dimensions</div>
          <div class="upgrade-effect" style="color: #8f8;">Dimension base multiplier: 4x → 6x</div>
          <div class="upgrade-cost-label" style="color: #f88;">Cost: 1 ton (1.000e6 g)</div>
          <div class="upgrade-unlock-hint" style="color: #aaa; margin-top: 0.5rem;">Unlocks after performing a Dimension Collapse. Increases dimension multiplier from 4x to 6x per level. Persists through Dimension Collapse.</div>
        `
      }
    } else {
      enhancedDimensionsBtn.style.display = 'none'
    }
  }
}

function updateScaleUpgradesTab() {
  // Update Mass Generation unlock
  const massGenBtn = document.getElementById("massGenerationUpgrade")
  if (massGenBtn) {
    const canAfford = scalePoints.gte(1) && !massGenerationUnlocked
    massGenBtn.disabled = !canAfford || massGenerationUnlocked
    if (massGenerationUnlocked) {
      massGenBtn.textContent = 'Mass Generation Unlocked!'
    } else {
      // Reset to original HTML structure if not unlocked
      massGenBtn.innerHTML = `
        <div class="upgrade-name" style="color: #f88;">Unlock Mass Generation</div>
        <div class="upgrade-effect" style="color: #8f8;">Start generating 1 g/s</div>
        <div class="upgrade-cost-label" style="color: #88f;">Cost: 1 Scale Point</div>
        <div class="upgrade-unlock-hint" style="color: #aaa; margin-top: 0.5rem;">Unlocks mass resource (g/s) and Mass Velocity Boost upgrade. Mass persists through prestige but resets to 0.</div>
      `
    }
  }

  // Update Auto Upgrade
  const autoUpgradeBtn = document.getElementById("autoUpgradeUpgrade")
  if (autoUpgradeBtn) {
    if (massGenerationUnlocked) {
      autoUpgradeBtn.style.display = 'block'
      const canAfford = scalePoints.gte(1) && !autoUpgradeUnlocked
      autoUpgradeBtn.disabled = !canAfford || autoUpgradeUnlocked
      if (autoUpgradeUnlocked) {
        autoUpgradeBtn.textContent = 'Auto Upgrade Unlocked!'
      } else {
        // Reset to original HTML structure if not unlocked
        autoUpgradeBtn.innerHTML = `
          <div class="upgrade-name">Auto Upgrade</div>
          <div class="upgrade-effect" style="color: #8f8;">Automatically buy all upgrades</div>
          <div class="upgrade-cost-label" style="color: #88f;">Cost: 1 Scale Point</div>
          <div class="upgrade-unlock-hint" style="color: #aaa; margin-top: 0.5rem;">Automatically purchases Velocity, Acceleration, Compression, and Mass Velocity upgrades when you can afford them. Unlocks after Mass Generation.</div>
        `
      }
    } else {
      autoUpgradeBtn.style.display = 'none'
    }
  }

  // Update Triple Mass upgrade
  const tripleMassBtn = document.getElementById("tripleMassUpgrade")
  if (tripleMassBtn) {
    if (massGenerationUnlocked) {
      tripleMassBtn.style.display = 'block'
      const canAfford = scalePoints.gte(5) && !tripleMassUnlocked
      tripleMassBtn.disabled = !canAfford || tripleMassUnlocked
      if (tripleMassUnlocked) {
        tripleMassBtn.textContent = 'Triple Mass Generation Unlocked!'
      } else {
        // Reset to original HTML structure if not unlocked
        tripleMassBtn.innerHTML = `
          <div class="upgrade-name">Triple Mass Generation</div>
          <div class="upgrade-effect" style="color: #8f8;">Mass generation ×3</div>
          <div class="upgrade-cost-label" style="color: #88f;">Cost: 5 Scale Points</div>
          <div class="upgrade-unlock-hint" style="color: #aaa; margin-top: 0.5rem;">Permanently triples mass generation (1 g/s → 3 g/s). Unlocks after Mass Generation. Never resets.</div>
        `
      }
    } else {
      tripleMassBtn.style.display = 'none'
    }
  }

  // Update Persistent Mass Upgrades
  const persistentMassBtn = document.getElementById("persistentMassUpgrade")
  if (persistentMassBtn) {
    if (massGenerationUnlocked) {
      persistentMassBtn.style.display = 'block'
      const canAfford = scalePoints.gte(15) && !persistentMassUpgrades
      persistentMassBtn.disabled = !canAfford || persistentMassUpgrades
      if (persistentMassUpgrades) {
        persistentMassBtn.textContent = 'Persistent Mass Upgrades Unlocked!'
      } else {
        // Reset to original HTML structure if not unlocked
        persistentMassBtn.innerHTML = `
          <div class="upgrade-name">Persistent Mass Upgrades</div>
          <div class="upgrade-effect" style="color: #8f8;">Keep mass upgrades on prestige</div>
          <div class="upgrade-cost-label" style="color: #88f;">Cost: 15 Scale Points</div>
          <div class="upgrade-unlock-hint" style="color: #aaa; margin-top: 0.5rem;">Mass Velocity Boost level and cost persist through prestige. Greatly accelerates progression! Mass amount still resets.</div>
        `
      }
    } else {
      persistentMassBtn.style.display = 'none'
    }
  }

  // Update Dimension Collapse unlock
  const dimensionCollapseBtn = document.getElementById("dimensionCollapseUpgrade")
  if (dimensionCollapseBtn) {
    const canAfford = scalePoints.gte(25) && !dimensionCollapseUnlocked
    dimensionCollapseBtn.disabled = !canAfford || dimensionCollapseUnlocked
    if (dimensionCollapseUnlocked) {
      dimensionCollapseBtn.textContent = 'Dimension Collapse Unlocked!'
    } else {
      // Reset to original HTML structure if not unlocked
      dimensionCollapseBtn.innerHTML = `
        <div class="upgrade-name" style="color: #f8f;">Unlock Dimension Collapse</div>
        <div class="upgrade-effect" style="color: #8f8;">Access to a new prestige layer</div>
        <div class="upgrade-cost-label" style="color: #88f;">Cost: 25 Scale Points</div>
        <div class="upgrade-unlock-hint" style="color: #aaa; margin-top: 0.5rem;">Unlock Dimension Collapse prestige (100 ly requirement). RESETS EVERYTHING including Scale Points and upgrades. Grants 1 Dimension Point per collapse. Dimension Points can buy dimensions that multiply ALL resources by 4x each.</div>
      `
    }
  }

}

function updateDimensionsTab() {
  // Update dimension purchase button
  const dimensionBtn = document.getElementById("buyDimension")
  if (dimensionBtn) {
    const canAfford = dimensionPoints.gte(dimensionCost)
    dimensionBtn.disabled = !canAfford
    dimensionBtn.querySelector('.upgrade-level').textContent = `Level ${dimensionLevel}`
    dimensionBtn.querySelector('.upgrade-cost').textContent = `${dimensionCost.toString()} DP`

    const baseMultiplier = enhancedDimensionsUnlocked ? 6 : 4
    const currentEffect = dimensionLevel === 0 ? new Decimal(1) : Decimal.pow(baseMultiplier, dimensionLevel)
    const nextEffect = Decimal.pow(baseMultiplier, dimensionLevel + 1)
    dimensionBtn.querySelector('.upgrade-effect').textContent =
      `${currentEffect.toPrecision(4)}x → ${nextEffect.toPrecision(4)}x (${baseMultiplier}x base)`
  }
}

function switchTab(tabName) {
  currentTab = tabName

  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName)
  })

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.dataset.tab === tabName)
  })

  updateUI()
}

// ---- Upgrade ----
function buyVelocityUpgrade() {
  const compressionDivision = calculateCompressionDivision()
  const discountedCost = upgradeCost.div(compressionDivision)
  if (distance.gte(discountedCost)) {
    distance = distance.minus(discountedCost)
    upgradeLevel++
    upgradeCost = upgradeCost.times(upgradeCostMultiplier)
    updateUI()
  }
}

function buyAccelUpgrade() {
  const compressionDivision = calculateCompressionDivision()
  const discountedCost = accelCost.div(compressionDivision)
  if (distance.gte(discountedCost)) {
    distance = distance.minus(discountedCost)
    accelLevel++
    accelCost = accelCost.times(accelCostMultiplier)
    updateUI()
  }
}

function buyCompressionUpgrade() {
  if (distance.gte(compressionCost)) {
    distance = distance.minus(compressionCost)
    compressionLevel++
    compressionCost = compressionCost.times(compressionCostMultiplier)
    updateUI()
  }
}

function buyMassVelocityUpgrade() {
  if (mass.gte(massVelocityCost)) {
    mass = mass.minus(massVelocityCost)
    massVelocityLevel++
    massVelocityCost = massVelocityCost.times(massVelocityCostMultiplier)
    updateUI()
  }
}

function autoBuyUpgrades() {
  // Auto-buy distance upgrades
  const compressionDivision = calculateCompressionDivision()

  // Buy velocity upgrades
  const discountedVelocityCost = upgradeCost.div(compressionDivision)
  if (distance.gte(discountedVelocityCost)) {
    distance = distance.minus(discountedVelocityCost)
    upgradeLevel++
    upgradeCost = upgradeCost.times(upgradeCostMultiplier)
  }

  // Buy acceleration upgrades if unlocked
  if (accelUnlocked) {
    const discountedAccelCost = accelCost.div(compressionDivision)
    if (distance.gte(discountedAccelCost)) {
      distance = distance.minus(discountedAccelCost)
      accelLevel++
      accelCost = accelCost.times(accelCostMultiplier)
    }
  }

  // Buy compression upgrades if unlocked
  if (compressionUnlocked) {
    if (distance.gte(compressionCost)) {
      distance = distance.minus(compressionCost)
      compressionLevel++
      compressionCost = compressionCost.times(compressionCostMultiplier)
    }
  }

  // Buy mass velocity upgrades if unlocked
  if (massUnlocked) {
    if (mass.gte(massVelocityCost)) {
      mass = mass.minus(massVelocityCost)
      massVelocityLevel++
      massVelocityCost = massVelocityCost.times(massVelocityCostMultiplier)
    }
  }
}

function unlockMassGeneration() {
  if (scalePoints.gte(1) && !massGenerationUnlocked) {
    scalePoints = scalePoints.minus(1)
    massGenerationUnlocked = true
    massUnlocked = true
    massPerSecond = new Decimal(1) // Start at 1 g/s
    updateUI()
    saveGame()
  }
}

function unlockAutoUpgrade() {
  if (scalePoints.gte(1) && !autoUpgradeUnlocked && massGenerationUnlocked) {
    scalePoints = scalePoints.minus(1)
    autoUpgradeUnlocked = true
    updateUI()
    saveGame()
  }
}

function unlockTripleMass() {
  if (scalePoints.gte(5) && !tripleMassUnlocked && massGenerationUnlocked) {
    scalePoints = scalePoints.minus(5)
    tripleMassUnlocked = true
    updateUI()
    saveGame()
  }
}

function unlockPersistentMass() {
  if (scalePoints.gte(15) && !persistentMassUpgrades && massGenerationUnlocked) {
    scalePoints = scalePoints.minus(15)
    persistentMassUpgrades = true
    updateUI()
    saveGame()
  }
}

function unlockDimensionCollapse() {
  if (scalePoints.gte(25) && !dimensionCollapseUnlocked) {
    scalePoints = scalePoints.minus(25)
    dimensionCollapseUnlocked = true
    updateUI()
    saveGame()
  }
}

function unlockEnhancedDimensions() {
  const cost = new Decimal(1e6) // 1 ton = 1e6 grams
  if (mass.gte(cost) && !enhancedDimensionsUnlocked && dimensionsTabUnlocked) {
    mass = mass.minus(cost)
    enhancedDimensionsUnlocked = true
    updateUI()
    saveGame()
  }
}

function buyDimension() {
  if (dimensionPoints.gte(dimensionCost)) {
    dimensionPoints = dimensionPoints.minus(dimensionCost)
    dimensionLevel++
    dimensionCost = dimensionCost.plus(dimensionCostMultiplier)
    updateUI()
    saveGame()
  }
}

// ---- Prestige: Unit Collapse ----
document.getElementById("prestige").onclick = () => {
  const prestigeThreshold = new Decimal(1e9) // 1e6 km = 1e9 m
  if (distance.lt(prestigeThreshold)) return

  // Calculate scale points gain
  // Formula: floor(log10(distance) - 8)
  // At 1e9m (1e6 km): log10(1e9) - 8 = 9 - 8 = 1 SP
  // At 1e10m: log10(1e10) - 8 = 10 - 8 = 2 SP
  // At 1e11m: log10(1e11) - 8 = 11 - 8 = 3 SP
  const gain = Decimal.floor(distance.log10() - 8)
  scalePoints = scalePoints.plus(gain)

  // Unlock Scale Upgrades tab on first prestige
  if (!scaleUpgradesUnlocked) {
    scaleUpgradesUnlocked = true
  }

  // Reset progress
  distance = new Decimal(0)
  distancePerSecond = new Decimal(1) // Reset velocity to 1 m/s
  upgradeLevel = 0
  upgradeCost = new Decimal(10)
  accelLevel = 0
  accelCost = new Decimal(1000)
  accelUnlocked = false
  compressionLevel = 0
  compressionCost = new Decimal(1e7)
  compressionUnlocked = false

  // Reset mass (always)
  mass = new Decimal(0)

  // Reset mass-based upgrades (unless Persistent Mass Upgrades is unlocked)
  if (!persistentMassUpgrades) {
    massVelocityLevel = 0
    massVelocityCost = new Decimal(100)
  }

  // Mass generation and unlock persist through prestige

  updateUI()
  saveGame()
}

// ---- Prestige: Dimension Collapse ----
function dimensionCollapse() {
  const dimensionThreshold = new Decimal(9.461e15) // 100 ly = 9.461e15 m
  if (distance.lt(dimensionThreshold)) return
  if (!dimensionCollapseUnlocked) return

  // Grant 1 dimension point
  dimensionPoints = dimensionPoints.plus(1)

  // Unlock Dimensions tab on first dimension collapse
  if (!dimensionsTabUnlocked) {
    dimensionsTabUnlocked = true
  }

  // RESET EVERYTHING
  distance = new Decimal(0)
  distancePerSecond = new Decimal(1)
  scalePoints = new Decimal(0)

  // Reset all distance upgrades
  upgradeLevel = 0
  upgradeCost = new Decimal(10)
  accelLevel = 0
  accelCost = new Decimal(1000)
  accelUnlocked = false
  compressionLevel = 0
  compressionCost = new Decimal(1e7)
  compressionUnlocked = false

  // Reset mass completely
  mass = new Decimal(0)
  massPerSecond = new Decimal(0)
  massUnlocked = false
  massVelocityLevel = 0
  massVelocityCost = new Decimal(100)

  // Reset scale upgrades (keep them locked but remember you had them)
  massGenerationUnlocked = false
  autoUpgradeUnlocked = false
  tripleMassUnlocked = false
  persistentMassUpgrades = false

  // Keep: dimensionCollapseUnlocked, scaleUpgradesUnlocked, dimensionsTabUnlocked
  // Keep: dimensionPoints, dimensionLevel, dimensionCost

  updateUI()
  saveGame()
}

// ---- Save/Load ----
function saveGame() {
  const saveData = {
    distance: distance.toString(),
    distancePerSecond: distancePerSecond.toString(),
    scalePoints: scalePoints.toString(),
    scaleUpgradesUnlocked: scaleUpgradesUnlocked,
    upgradeLevel: upgradeLevel,
    upgradeCost: upgradeCost.toString(),
    accelLevel: accelLevel,
    accelCost: accelCost.toString(),
    accelUnlocked: accelUnlocked,
    compressionLevel: compressionLevel,
    compressionCost: compressionCost.toString(),
    compressionUnlocked: compressionUnlocked,
    mass: mass.toString(),
    massPerSecond: massPerSecond.toString(),
    massUnlocked: massUnlocked,
    massVelocityLevel: massVelocityLevel,
    massVelocityCost: massVelocityCost.toString(),
    massGenerationUnlocked: massGenerationUnlocked,
    autoUpgradeUnlocked: autoUpgradeUnlocked,
    tripleMassUnlocked: tripleMassUnlocked,
    persistentMassUpgrades: persistentMassUpgrades,
    dimensionPoints: dimensionPoints.toString(),
    dimensionLevel: dimensionLevel,
    dimensionCost: dimensionCost.toString(),
    dimensionCollapseUnlocked: dimensionCollapseUnlocked,
    dimensionsTabUnlocked: dimensionsTabUnlocked,
    enhancedDimensionsUnlocked: enhancedDimensionsUnlocked,
    tickRate: tickRate,
    autoSaveInterval: autoSaveInterval,
    lastTime: Date.now()
  }
  // Save to localStorage in base64 format
  const jsonString = JSON.stringify(saveData)
  const encoded = btoa(jsonString)
  localStorage.setItem('scaleSave', encoded)
}

function loadGame() {
  const saveData = localStorage.getItem('scaleSave')
  if (!saveData) return

  try {
    // Try to decode from base64 first (new format)
    let jsonString = saveData
    try {
      jsonString = atob(saveData)
    } catch {
      // If base64 decode fails, assume it's raw JSON (backwards compatibility)
      console.log('Loading from old JSON format, will convert to base64 on next save')
    }

    const data = JSON.parse(jsonString)
    distance = new Decimal(data.distance)
    distancePerSecond = new Decimal(data.distancePerSecond)
    scalePoints = new Decimal(data.scalePoints)
    scaleUpgradesUnlocked = data.scaleUpgradesUnlocked || false
    upgradeLevel = data.upgradeLevel || 0
    upgradeCost = new Decimal(data.upgradeCost)
    accelLevel = data.accelLevel || 0
    accelCost = new Decimal(data.accelCost || 1000)
    accelUnlocked = data.accelUnlocked || false
    compressionLevel = data.compressionLevel || 0
    compressionCost = new Decimal(data.compressionCost || 1e7)
    compressionUnlocked = data.compressionUnlocked || false
    mass = new Decimal(data.mass || 0)
    massPerSecond = new Decimal(data.massPerSecond || 0)
    massUnlocked = data.massUnlocked || false
    massVelocityLevel = data.massVelocityLevel || 0
    massVelocityCost = new Decimal(data.massVelocityCost || 100)
    massGenerationUnlocked = data.massGenerationUnlocked || false
    autoUpgradeUnlocked = data.autoUpgradeUnlocked || false
    tripleMassUnlocked = data.tripleMassUnlocked || false
    persistentMassUpgrades = data.persistentMassUpgrades || false
    dimensionPoints = new Decimal(data.dimensionPoints || 0)
    dimensionLevel = data.dimensionLevel || 0
    dimensionCost = new Decimal(data.dimensionCost || 1)
    dimensionCollapseUnlocked = data.dimensionCollapseUnlocked || false
    dimensionsTabUnlocked = data.dimensionsTabUnlocked || false
    enhancedDimensionsUnlocked = data.enhancedDimensionsUnlocked || false

    // Settings
    if (data.tickRate) {
      const r = Math.max(10, Math.min(60, Math.floor(Number(data.tickRate) || 60)))
      tickRate = r
      tickDt = 1 / tickRate
    }

    if (data.autoSaveInterval) {
      const s = Math.max(1, Math.min(60, Math.floor(Number(data.autoSaveInterval) || 30)))
      autoSaveInterval = s
    }

    // Calculate offline progress
    if (data.lastTime) {
      const offlineTime = (Date.now() - data.lastTime) / 1000
      const offlineGain = distancePerSecond.times(calculateTotalMultiplier()).times(offlineTime)
      distance = distance.plus(offlineGain)

      if (massUnlocked) {
        const massMultiplier = calculateMassMultiplier()
        const offlineMassGain = massPerSecond.times(massMultiplier).times(offlineTime)
        mass = mass.plus(offlineMassGain)
        console.log(`Offline for ${Math.floor(offlineTime)}s - gained ${formatDistance(offlineGain)} and ${formatMass(offlineMassGain)}`)
      } else {
        console.log(`Offline for ${Math.floor(offlineTime)}s - gained ${formatDistance(offlineGain)}`)
      }
    }
  } catch (e) {
    console.error('Failed to load save:', e)
  }
}

// ---- Settings: Version / Export / Import ----
function initSettingsUI() {
  const v = document.getElementById('version')
  if (v) v.textContent = `Version: ${GAME_VERSION}`

  // Sync tick rate UI to current value (loaded from save or default)
  const tickSlider = document.getElementById('tickRate')
  const tickValueEl = document.getElementById('tickRateValue')
  if (tickSlider) tickSlider.value = String(tickRate)
  if (tickValueEl) tickValueEl.textContent = String(tickRate)

  // Sync autosave interval UI to current value (loaded from save or default)
  const saveSlider = document.getElementById('autoSaveInterval')
  const saveValueEl = document.getElementById('autoSaveIntervalValue')
  if (saveSlider) saveSlider.value = String(autoSaveInterval)
  if (saveValueEl) saveValueEl.textContent = String(autoSaveInterval)
}

function setSettingsMsg(text, isError = false) {
  const el = document.getElementById('settingsMsg')
  if (!el) return
  el.textContent = text
  el.style.color = isError ? '#f88' : '#aaa'
}

function exportSave() {
  // Ensure we have something to export
  saveGame()
  const encoded = localStorage.getItem('scaleSave') || ''
  const box = document.getElementById('exportBox')
  if (box) {
    // Already in base64 format from localStorage
    box.value = encoded
    box.scrollTop = 0
  }
  setSettingsMsg(encoded ? `Exported ${encoded.length.toLocaleString()} characters (base64 encoded).` : 'No save found yet.')
}

async function copyExport() {
  const box = document.getElementById('exportBox')
  if (!box) return
  if (!box.value.trim()) exportSave()

  const text = box.value
  try {
    await navigator.clipboard.writeText(text)
    setSettingsMsg('Copied export to clipboard.')
  } catch {
    // Fallback for older browsers / permissions
    box.focus()
    box.select()
    const ok = document.execCommand('copy')
    setSettingsMsg(ok ? 'Copied export to clipboard.' : 'Could not copy automatically. Select + copy manually.', !ok)
  }
}

function importSave() {
  const box = document.getElementById('importBox')
  if (!box) return
  const input = box.value.trim()
  if (!input) {
    setSettingsMsg('Paste a save first.', true)
    return
  }

  let parsed = null
  let raw = input

  // Try base64 → JSON first (new default)
  try {
    raw = atob(input)
    parsed = JSON.parse(raw)
  } catch {
    // Fallback to raw JSON (for backwards compatibility)
    try {
      parsed = JSON.parse(input)
    } catch {
      setSettingsMsg('Import failed: invalid base64 or JSON format.', true)
      return
    }
  }

  // Re-serialize and encode to base64 for localStorage
  try {
    const jsonString = JSON.stringify(parsed)
    const encoded = btoa(jsonString)
    localStorage.setItem('scaleSave', encoded)
    setSettingsMsg('Import successful. Reloading…')
    location.reload()
  } catch (e) {
    console.error(e)
    setSettingsMsg('Import failed: could not write to localStorage.', true)
  }
}

// Make settings functions accessible from inline HTML onclick
window.exportSave = exportSave
window.copyExport = copyExport
window.importSave = importSave
window.onTickRateInput = onTickRateInput
window.onAutoSaveIntervalInput = onAutoSaveIntervalInput

// Make dimension functions accessible from inline HTML onclick
window.dimensionCollapse = dimensionCollapse
window.unlockDimensionCollapse = unlockDimensionCollapse
window.unlockEnhancedDimensions = unlockEnhancedDimensions
window.buyDimension = buyDimension

// Make scale upgrade functions accessible
window.unlockAutoUpgrade = unlockAutoUpgrade

// Auto-save with configurable interval (default 30 seconds)
window.autoSaveIntervalId = setInterval(saveGame, autoSaveInterval * 1000)

// ---- Hard Reset ----
function hardReset() {
  if (confirm('Are you sure? This will delete all progress!')) {
    localStorage.removeItem('scaleSave')
    location.reload()
  }
}

// Make it accessible from console
window.hardReset = hardReset

// ---- Start ----
console.log('Starting game...')
loadGame()
initSettingsUI()
console.log('Game state loaded, starting loop...')
gameLoop()
console.log('Game loop started!')
