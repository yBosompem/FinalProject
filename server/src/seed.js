require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Exam = require('./models/Exam');
const { mongoUri } = require('./config');

async function seed() {
  await mongoose.connect(mongoUri);
  await User.deleteMany({});
  await Exam.deleteMany({});

  const admin = await User.create({
    name: 'Dr. Admin',
    email: 'admin@university.edu',
    password: 'admin123',
    role: 'admin',
  });

  const student = await User.create({
    name: 'Jane Student',
    email: 'student@university.edu',
    password: 'student123',
    role: 'student',
    studentId: '1234567',
    referenceNumber: '12345678',
  });

  await Exam.create({
    title: 'Introduction to Computer Science — Midterm',
    description: 'Closed-book exam. Webcam monitoring is required.',
    durationMinutes: 30,
    rules: 'Remain visible on camera. No other persons in frame.',
    isPublished: true,
    createdBy: admin._id,
    questions: [
      {
        text: 'What does CPU stand for?',
        options: [
          'Central Processing Unit',
          'Computer Personal Unit',
          'Central Program Utility',
          'Control Processing Unit',
        ],
        correctIndex: 0,
      },
      {
        text: 'Which data structure uses FIFO?',
        options: ['Stack', 'Queue', 'Tree', 'Graph'],
        correctIndex: 1,
      },
      {
        text: 'HTTP status 404 means:',
        options: ['Success', 'Not Found', 'Server Error', 'Unauthorized'],
        correctIndex: 1,
      },
    ],
  });

  console.log('Seed complete.');
  console.log('Admin:  admin@university.edu / admin123');
  console.log('Student: student@university.edu / student123');
  await mongoose.disconnect();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
