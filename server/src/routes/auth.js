const express = require('express');
const User = require('../models/User');
const { signToken, authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, studentId, college, faculty, department, level } = req.body;
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
    if (normalizedRole === 'student' && (!college || !faculty || !department || !level)) {
      return res.status(400).json({
        message: 'Student level, college, faculty, and department are required',
      });
    }

    const user = await User.create({
      name,
      email: normalizedEmail,
      password,
      role: normalizedRole,
      studentId: normalizedRole === 'student' ? studentId : '',
      college: normalizedRole === 'student' ? college : '',
      faculty: normalizedRole === 'student' ? faculty : '',
      department: normalizedRole === 'student' ? department : '',
      level: normalizedRole === 'student' ? Number(level) : undefined,
    });
    const token = signToken(user);
    res.status(201).json({ user, token });
  } catch (err) {
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
