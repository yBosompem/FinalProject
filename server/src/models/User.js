const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ['student', 'admin'], default: 'student' },
    studentId: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 7,
      validate: {
        validator(value) {
          return this.role !== 'student' || Boolean(value);
        },
        message: 'Index number is required for students',
      },
    },
    referenceNumber: {
      type: String,
      trim: true,
      validate: {
        validator(value) {
          return this.role !== 'student' || /^\d{8}$/.test(String(value || ''));
        },
        message: 'Reference number must be exactly 8 digits',
      },
    },
    college: { type: String, trim: true, default: '' },
    faculty: { type: String, trim: true, default: '' },
    department: { type: String, trim: true, default: '' },
    level: { type: Number, enum: [100, 200, 300, 400, 500, 600] },
  },
  { timestamps: true }
);

userSchema.index(
  { studentId: 1 },
  {
    unique: true,
    partialFilterExpression: { role: 'student', studentId: { $type: 'string', $ne: '' } },
  }
);

userSchema.index(
  { referenceNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { role: 'student', referenceNumber: { $type: 'string', $ne: '' } },
  }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
