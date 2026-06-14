const mongoose = require('mongoose');

const monitoringEventSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSession', required: true },
    type: {
      type: String,
      enum: [
        'no_face',
        'multiple_faces',
        'looking_away',
        'unusual_movement',
        'face_verified',
        'monitoring_started',
        'screen_share_started',
        'screen_share_stopped',
        'screen_share_not_monitor',
        'exam_submitted',
        'phone_detected',
        'voice_detected',
        'whispering_detected',
        'suspicious_head_movement',
        'tab_hidden',
        'window_blur',
        'recording_saved',
      ],
      required: true,
    },
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    message: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    riskDelta: { type: Number, default: 0 },
  },
  { timestamps: true }
);

monitoringEventSchema.index({ session: 1, createdAt: -1 });

module.exports = mongoose.model('MonitoringEvent', monitoringEventSchema);
