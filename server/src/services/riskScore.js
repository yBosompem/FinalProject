const RISK_WEIGHTS = {
  no_face: 15,
  multiple_faces: 30,
  looking_away: 5,
  eye_gaze_away: 4,
  mouth_open: 4,
  suspicious_head_movement: 5,
  face_spoofing: 20,
  phone_detected: 28,
  suspicious_object_detected: 6,
  voice_detected: 12,
  whispering_detected: 14,
  speech_match_detected: 18,
  unusual_movement: 4,
  screen_share_stopped: 25,
  screen_share_not_monitor: 12,
  external_device_connected: 18,
  tab_hidden: 20,
  window_blur: 14,
  face_verified: 0,
  monitoring_started: 0,
  screen_share_started: 0,
  exam_submitted: 0,
  recording_saved: 0,
};

const SEVERITY_MULTIPLIER = { low: 0.6, medium: 1, high: 1.4 };

function deltaForEvent(type, severity = 'medium') {
  const base = RISK_WEIGHTS[type] ?? 8;
  return Math.round(base * (SEVERITY_MULTIPLIER[severity] || 1));
}

function effectiveRiskDelta(event) {
  if (RISK_WEIGHTS[event.type] === 0) return 0;
  return event.riskDelta ?? deltaForEvent(event.type, event.severity);
}

function computeRiskScore(events) {
  const scored = events.filter((e) => effectiveRiskDelta(e) > 0);
  if (scored.length === 0) return 0;

  let score = 0;
  for (const event of scored) {
    score += effectiveRiskDelta(event);
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

module.exports = { deltaForEvent, effectiveRiskDelta, computeRiskScore, shouldFlag, RISK_WEIGHTS };
