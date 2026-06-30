const express = require('express');
const User = require('../models/User');
const { signToken, authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, studentId, referenceNumber, college, faculty, department, level } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) {
      return res.status(409).json({
        message: 'This email is already registered. Each user must have a unique email.',
      });
    }

    const normalizedRole = role === 'admin' ? 'admin' : 'student';
    const normalizedStudentId = String(studentId || '').trim().toUpperCase();
    const normalizedReferenceNumber = String(referenceNumber || '').trim();
    if (normalizedRole === 'student' && (!college || !faculty || !department || !level)) {
      return res.status(400).json({
        message: 'Student level, college, faculty, and department are required',
      });
    }
    if (normalizedRole === 'student') {
      if (!normalizedStudentId) {
        return res.status(400).json({ message: 'Index number is required' });
      }
      if (normalizedStudentId.length > 7) {
        return res.status(400).json({ message: 'Index number must be 7 characters or fewer' });
      }
      if (!/^\d{8}$/.test(normalizedReferenceNumber)) {
        return res.status(400).json({ message: 'Reference number must be exactly 8 digits' });
      }
      const indexExists = await User.findOne({ role: 'student', studentId: normalizedStudentId });
      if (indexExists) {
        return res.status(409).json({ message: 'This index number is already registered.' });
      }
      const referenceExists = await User.findOne({
        role: 'student',
        referenceNumber: normalizedReferenceNumber,
      });
      if (referenceExists) {
        return res.status(409).json({ message: 'This reference number is already registered.' });
      }
    }

    const user = await User.create({
      name,
      email: normalizedEmail,
      password,
      role: normalizedRole,
      studentId: normalizedRole === 'student' ? normalizedStudentId : '',
      referenceNumber: normalizedRole === 'student' ? normalizedReferenceNumber : '',
      college: normalizedRole === 'student' ? college : '',
      faculty: normalizedRole === 'student' ? faculty : '',
      department: normalizedRole === 'student' ? department : '',
      level: normalizedRole === 'student' ? Number(level) : undefined,
    });
    const token = signToken(user);
    res.status(201).json({ user, token });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.studentId) {
      return res.status(409).json({ message: 'This index number is already registered.' });
    }
    if (err.code === 11000 && err.keyPattern?.referenceNumber) {
      return res.status(409).json({ message: 'This reference number is already registered.' });
    }
    res.status(500).json({ message: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const token = signToken(user);
    res.json({ user, token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
