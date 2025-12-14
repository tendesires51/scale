// ---- Core State ----
const GAME_VERSION = "pre-release 0.1"
let distance = new Decimal(0)
let distancePerSecond = new Decimal(1) // Start at 1 m/s
let scalePoints = new Decimal(0)

// Mass system (unlocks with first scale upgrade)
let mass = new Decimal(0)
let massPerSecond = new Decimal(0) // Starts at 0, unlocked by scale upgrade
let massUnlocked = false

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

// ---- Scale Upgrades ----
// Unlock Mass Generation (costs 1 Scale Point)
let massGenerationUnlocked = false

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

// Make it accessible from console
window.setTickRate = setTickRate

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

  return mult
}

// ---- UI ----
function updateUI() {
  // Update main stats (runs at 60 FPS)
  const distanceEl = document.getElementById("distance")
  const rateEl = document.getElementById("rate")
  const scalePointsEl = document.getElementById("scalePoints")
  const massEl = document.getElementById("mass")
  const massRateEl = document.getElementById("massRate")

  if (!distanceEl || !rateEl || !scalePointsEl) return

  distanceEl.textContent = formatDistance(distance)

  const totalRate = distancePerSecond.times(calculateTotalMultiplier())
  rateEl.textContent = `+${formatDistance(totalRate)} / sec`

  scalePointsEl.textContent = `Scale Points: ${scalePoints.toString()}`

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
  }

  // Update Scale Upgrades tab visibility
  const scaleUpgradesTab = document.querySelector('.tab-btn[data-tab="scale"]')
  if (scaleUpgradesTab) {
    scaleUpgradesTab.style.display = scaleUpgradesUnlocked ? 'block' : 'none'
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
}

function updateScaleUpgradesTab() {
  // Update Mass Generation unlock
  const massGenBtn = document.getElementById("massGenerationUpgrade")
  if (massGenBtn) {
    const canAfford = scalePoints.gte(1) && !massGenerationUnlocked
    massGenBtn.disabled = !canAfford || massGenerationUnlocked
    if (massGenerationUnlocked) {
      massGenBtn.textContent = 'Mass Generation Unlocked!'
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
      }
    } else {
      persistentMassBtn.style.display = 'none'
    }
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
    tripleMassUnlocked: tripleMassUnlocked,
    persistentMassUpgrades: persistentMassUpgrades,
    tickRate: tickRate,
    lastTime: Date.now()
  }
  localStorage.setItem('scaleSave', JSON.stringify(saveData))
}

function loadGame() {
  const saveData = localStorage.getItem('scaleSave')
  if (!saveData) return

  try {
    const data = JSON.parse(saveData)
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
    tripleMassUnlocked = data.tripleMassUnlocked || false
    persistentMassUpgrades = data.persistentMassUpgrades || false

    // Settings
    if (data.tickRate) {
      const r = Math.max(10, Math.min(60, Math.floor(Number(data.tickRate) || 60)))
      tickRate = r
      tickDt = 1 / tickRate
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
  const slider = document.getElementById('tickRate')
  const valueEl = document.getElementById('tickRateValue')
  if (slider) slider.value = String(tickRate)
  if (valueEl) valueEl.textContent = String(tickRate)
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
  const raw = localStorage.getItem('scaleSave') || ''
  const box = document.getElementById('exportBox')
  if (box) {
    box.value = raw
    box.scrollTop = 0
  }
  setSettingsMsg(raw ? `Exported ${raw.length.toLocaleString()} characters.` : 'No save found yet.')
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

  // Try raw JSON first
  try {
    parsed = JSON.parse(input)
  } catch {
    // Try base64 → JSON
    try {
      raw = atob(input)
      parsed = JSON.parse(raw)
    } catch {
      setSettingsMsg('Import failed: invalid JSON (and not valid base64 JSON).', true)
      return
    }
  }

  // Re-serialize to ensure localStorage holds a clean JSON string
  try {
    localStorage.setItem('scaleSave', JSON.stringify(parsed))
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

// Auto-save every 5 seconds
setInterval(saveGame, 5000)

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
