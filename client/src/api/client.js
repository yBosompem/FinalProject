const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

function getToken() {
  return localStorage.getItem('token');
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

export const api = {
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/auth/me'),
  getExams: () => request('/exams'),
  getExam: (id) => request(`/exams/${id}`),
  createExam: (body) => request('/exams', { method: 'POST', body: JSON.stringify(body) }),
  updateExam: (id, body) => request(`/exams/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  updateExamSettings: (id, body) =>
    request(`/exams/${id}/settings`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteExam: (id) => request(`/exams/${id}`, { method: 'DELETE' }),
  getExamAttemptStatus: (examId) => request(`/sessions/exam/${examId}/status`),
  startSession: (examId) => request(`/sessions/start/${examId}`, { method: 'POST' }),
  postMonitoringEvent: (sessionId, body) =>
    request(`/monitoring/events/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getSession: (id) => request(`/sessions/${id}`),
  getSessions: () => request('/sessions'),
  getActiveSessions: () => request('/sessions/active'),
  saveAnswers: (id, answers) =>
    request(`/sessions/${id}/answers`, {
      method: 'PATCH',
      body: JSON.stringify({ answers }),
    }),
  submitSession: (id, body) =>
    request(`/sessions/${id}/submit`, { method: 'POST', body: JSON.stringify(body || {}) }),
  getStudentResults: (sessionId) => request(`/sessions/${sessionId}/results`),
  getExamSubmissions: (examId) => request(`/sessions/by-exam/${examId}`),
  getReport: (id) => request(`/sessions/${id}/report`),
  analyzeFrame: (sessionId, image, screenImage) =>
    request(`/monitoring/analyze/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ image, screenImage }),
    }),
  uploadRecording: async (sessionId, blob) => {
    const form = new FormData();
    form.append('recording', blob, 'proctoring.webm');
    const token = getToken();
    const res = await fetch(`${API_BASE}/monitoring/recording/${sessionId}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Recording upload failed');
    return data;
  },
  fetchRecordingBlob: async (sessionId) => {
    const token = getToken();
    const res = await fetch(`${API_BASE}/monitoring/recording/${sessionId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Recording not available');
    return res.blob();
  },
  getEvents: (sessionId) => request(`/monitoring/events/${sessionId}`),
  getFlagged: () => request('/monitoring/flagged'),
};
