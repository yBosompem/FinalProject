import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import Layout, { NavItem } from '../../components/Layout';

export default function ExamStudents() {
  const { examId } = useParams();
  const [data, setData] = useState(null);
  const [allSessions, setAllSessions] = useState([]);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    college: '',
    faculty: '',
    department: '',
    level: '',
  });

  const load = () => {
    Promise.all([api.getExamSubmissions(examId), api.getSessions()])
      .then(([submissions, sessions]) => {
        setData(submissions);
        setAllSessions(sessions);
      })
      .catch((err) => setError(err.message));
  };

  useEffect(load, [examId]);

  const toggleResults = async () => {
    await api.updateExam(examId, {
      showResultsToStudents: !data.exam.showResultsToStudents,
    });
    load();
  };

  if (error) {
    return (
      <Layout nav={<NavItem to="/admin">Dashboard</NavItem>}>
        <div className="container">
          <div className="alert alert-error">{error}</div>
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <div className="container" style={{ paddingTop: '4rem' }}>
        Loading...
      </div>
    );
  }

  const completed = data.sessions.filter((s) => ['submitted', 'expired'].includes(s.status));
  const sessionGrade = (s) =>
    s?.reportReady && s.scaledScore != null ? Number(s.scaledScore) : '---';
  const sessionRaw = (s) =>
    s?.reportReady && s.correctCount != null
      ? `${s.correctCount} / ${s.totalQuestions ?? s.exam?.questionCount ?? '---'}`
      : '---';
  const numericGrade = (s) => (s?.reportReady && Number.isFinite(Number(s.scaledScore)) ? Number(s.scaledScore) : 0);
  const normalizeCourseTitle = (title) =>
    String(title || '')
      .toLowerCase()
      .replace(/\b(midsemester|midsem|midterm|end\s*of\s*semester|semester|exam|examination)\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const courseKey = normalizeCourseTitle(data.exam.title);
  const sessionStudentKey = (s) => s.student?.studentId || s.student?._id || s.student?.email || '';
  const relatedCompletedSessions = allSessions.filter(
    (s) =>
      ['submitted', 'expired'].includes(s.status) &&
      normalizeCourseTitle(s.exam?.title) === courseKey
  );
  const findRelatedScore = (studentKey, type) =>
    relatedCompletedSessions.find(
      (s) => sessionStudentKey(s) === studentKey && s.exam?.examType === type
    );
  const finalGrade = (studentKey) => {
    const mid = findRelatedScore(studentKey, 'midsemester');
    const end = findRelatedScore(studentKey, 'end_of_semester');
    if (!mid?.reportReady && !end?.reportReady) return '---';
    return Number((numericGrade(mid) + numericGrade(end)).toFixed(2));
  };
  const optionValues = (field) =>
    Array.from(
      new Set(
        data.sessions
          .map((s) => s.student?.[field])
          .filter((value) => value != null && String(value).trim() !== '')
          .map(String)
      )
    ).sort((a, b) => a.localeCompare(b));

  const filteredSessions = completed
    .filter((s) => {
      const student = s.student || {};
      return (
        (!filters.college || student.college === filters.college) &&
        (!filters.faculty || student.faculty === filters.faculty) &&
        (!filters.department || student.department === filters.department) &&
        (!filters.level || String(student.level) === String(filters.level))
      );
    })
    .sort((a, b) => {
      const indexOrder = String(a.student?.studentId || '').localeCompare(
        String(b.student?.studentId || ''),
        undefined,
        { numeric: true, sensitivity: 'base' }
      );
      if (indexOrder !== 0) return indexOrder;
      return String(a.student?.name || '').localeCompare(String(b.student?.name || ''));
    });

  const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const compactResultRow = (s) => {
    const studentKey = sessionStudentKey(s);
    const mid = findRelatedScore(studentKey, 'midsemester');
    const end = findRelatedScore(studentKey, 'end_of_semester');
    return [
      s.student?.name || '',
      s.student?.studentId || '',
      s.student?.referenceNumber || '',
      data.exam.title || '',
      sessionGrade(mid),
      sessionGrade(end),
      finalGrade(studentKey),
    ];
  };

  const exportCsv = () => {
    const rows = [
      ['Student name', 'Index number', 'Reference number', 'Course title', 'Midsem grade', 'End sem grade', 'Final grade'],
      ...filteredSessions.map(compactResultRow),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${data.exam.title.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_results.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printResults = async () => {
    if (window.electronAPI?.printPage) {
      try {
        const result = await window.electronAPI.printPage();
        if (!result?.ok && result?.message) {
          setError(result.message);
        }
        return;
      } catch (err) {
        console.warn('Electron print bridge unavailable, falling back to window.print:', err.message);
        window.print();
        return;
      }
    }
    window.print();
  };

  const groups = Object.values(
    filteredSessions.reduce((acc, session) => {
      const department = session.student?.department || 'Unassigned department';
      const level = session.student?.level || 'Unassigned level';
      const key = `${department}__${level}`;
      const college = session.student?.college || 'Unassigned college';
      const faculty = session.student?.faculty || 'Unassigned faculty';
      if (!acc[key]) acc[key] = { college, faculty, department, level, sessions: [] };
      acc[key].sessions.push(session);
      return acc;
    }, {})
  ).sort((a, b) => {
    const dept = a.department.localeCompare(b.department);
    if (dept !== 0) return dept;
    return String(a.level).localeCompare(String(b.level));
  });

  const renderSessionRow = (s) => (
    <tr key={s._id}>
      <td>
        <strong>{s.student?.name}</strong>
      </td>
      <td>{s.student?.studentId || '---'}</td>
      <td>{s.student?.referenceNumber || '---'}</td>
      <td>{data.exam.title}</td>
      <td>{sessionRaw(findRelatedScore(sessionStudentKey(s), 'midsemester'))}</td>
      <td>{sessionRaw(findRelatedScore(sessionStudentKey(s), 'end_of_semester'))}</td>
      <td>{sessionGrade(findRelatedScore(sessionStudentKey(s), 'midsemester'))}</td>
      <td>{sessionGrade(findRelatedScore(sessionStudentKey(s), 'end_of_semester'))}</td>
      <td>{finalGrade(sessionStudentKey(s))}</td>
      <td className="no-print">
        {['submitted', 'expired'].includes(s.status) ? (
          <Link to={`/admin/report/${s._id}`}>View report</Link>
        ) : (
          <span style={{ color: 'var(--muted)' }}>In progress</span>
        )}
      </td>
    </tr>
  );

  return (
    <Layout
      nav={
        <>
          <NavItem to="/admin">Dashboard</NavItem>
          <NavItem to={`/admin/exam/${examId}/students`}>Students</NavItem>
        </>
      }
    >
      <div className="container">
        <h1 className="page-title">{data.exam.title}</h1>
        <p className="page-sub">
          Completed results, grouped by college, faculty, department, and level.
        </p>

        <div className="card no-print" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <strong>Release results to students</strong>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
                When enabled, students can see their score after submitting.
              </p>
            </div>
            <button type="button" className="btn btn-primary" onClick={toggleResults}>
              {data.exam.showResultsToStudents ? 'Results visible' : 'Results hidden'}
            </button>
          </div>
        </div>

        <div className="card no-print" style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Retrieve results</h2>
          <div className="grid-2" style={{ gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))' }}>
            {[
              ['college', 'College'],
              ['faculty', 'Faculty'],
              ['department', 'Department'],
              ['level', 'Level'],
            ].map(([field, label]) => (
              <div className="form-group" key={field}>
                <label className="label">{label}</label>
                <select
                  className="input"
                  value={filters[field]}
                  onChange={(e) => setFilters((prev) => ({ ...prev, [field]: e.target.value }))}
                >
                  <option value="">All {label.toLowerCase()}</option>
                  {optionValues(field).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="btn btn-primary" onClick={exportCsv} disabled={filteredSessions.length === 0}>
              Export CSV for Excel
            </button>
            <button type="button" className="btn btn-ghost" onClick={printResults} disabled={filteredSessions.length === 0}>
              Print results
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setFilters({ college: '', faculty: '', department: '', level: '' })}
            >
              Clear filters
            </button>
            <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
              {filteredSessions.length} completed student(s)
            </span>
          </div>
        </div>

        {filteredSessions.length === 0 ? (
          <div className="card" style={{ color: 'var(--muted)' }}>
            No completed results match the selected filters.
          </div>
        ) : (
          groups.map((group) => (
            <section key={`${group.department}-${group.level}`} style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.05rem' }}>{group.department}</h2>
                <span className="badge badge-info">{group.college}</span>
                <span className="badge badge-info">{group.faculty}</span>
                <span className="badge badge-info">Level {group.level}</span>
                <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                  {group.sessions.length} session(s)
                </span>
              </div>
              <div className="card print-only" style={{ padding: 0, overflow: 'hidden', marginBottom: '1rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Student name</th>
                      <th>Index number</th>
                      <th>Reference number</th>
                      <th>Course title</th>
                      <th>Midsem grade</th>
                      <th>End sem grade</th>
                      <th>Final grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.sessions.map((s) => (
                      <tr key={`print-${s._id}`}>
                        {compactResultRow(s).map((cell, index) => (
                          <td key={index}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card no-print-details" style={{ padding: 0, overflow: 'hidden' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Student name</th>
                      <th>Index number</th>
                      <th>Reference number</th>
                      <th>Course title</th>
                      <th>Midsem raw</th>
                      <th>End sem raw</th>
                      <th>Midsem grade</th>
                      <th>End sem grade</th>
                      <th>Final grade</th>
                      <th className="no-print">Report</th>
                    </tr>
                  </thead>
                  <tbody>{group.sessions.map(renderSessionRow)}</tbody>
                </table>
              </div>
            </section>
          ))
        )}

        <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--muted)' }}>
          Showing {filteredSessions.length} of {completed.length} completed session(s)
        </p>
      </div>
    </Layout>
  );
}
