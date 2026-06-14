const RISK_WEIGHTS = {
  no_face: 15,
  multiple_faces: 30,
  looking_away: 12,
  suspicious_head_movement: 14,
  phone_detected: 28,
  voice_detected: 22,
  whispering_detected: 24,
  unusual_movement: 10,
  screen_share_stopped: 25,
  screen_share_not_monitor: 12,
  tab_hidden: 20,
  window_blur: 14,
};

const SEVERITY_MULTIPLIER = { low: 0.6, medium: 1, high: 1.4 };

function deltaForEvent(type, severity = 'medium') {
  const base = RISK_WEIGHTS[type] || 8;
  return Math.round(base * (SEVERITY_MULTIPLIER[severity] || 1));
}

function computeRiskScore(events) {
  const scored = events.filter((e) => (e.riskDelta ?? 0) > 0);
  if (scored.length === 0) return 0;

  let score = 0;
  for (const event of scored) {
    score += event.riskDelta ?? deltaForEvent(event.type, event.severity);
  }

  const highCount = scored.filter((e) => e.severity === 'high').length;
  if (highCount >= 3) {
    score = Math.min(100, Math.round(score * 1.15));
  }

  return Math.min(100, score);
}

function shouldFlag(score, alertCount) {
  return score >= 55 || alertCount >= 6;
}

module.exports = { deltaForEvent, computeRiskScore, shouldFlag, RISK_WEIGHTS };
