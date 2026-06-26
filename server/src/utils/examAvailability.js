function getExamAvailability(exam, now = new Date()) {
  const startsAt = exam.availableFrom ? new Date(exam.availableFrom) : null;
  const endsAt = exam.availableUntil ? new Date(exam.availableUntil) : null;

  if (startsAt && now < startsAt) {
    return {
      status: 'pending',
      canStart: false,
      message: 'Exam is pending and cannot be started yet.',
      startsAt,
      endsAt,
    };
  }

  if (endsAt && now > endsAt) {
    return {
      status: 'closed',
      canStart: false,
      message: 'Exam availability has ended.',
      startsAt,
      endsAt,
    };
  }

  return {
    status: 'available',
    canStart: true,
    message: 'Exam is available.',
    startsAt,
    endsAt,
  };
}

function assertExamAvailable(exam, now = new Date()) {
  const availability = getExamAvailability(exam, now);
  if (!availability.canStart) {
    return { availability, error: availability.message };
  }
  return { availability };
}

module.exports = { getExamAvailability, assertExamAvailable };
