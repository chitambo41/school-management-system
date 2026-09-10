/**
 * Shared PDF drawing for the student academic report.
 * Writes onto a pdfkit document opened by the caller (headers/pipe handled there).
 */
const path = require('path');

function writeStudentReportPdf(doc, report, opts) {
  const { student, current, terms, overall } = report;
  const { logoPath, approvedLine } = opts || {};

  const drawHeader = (subtitle) => {
    try {
      if (logoPath && require('fs').existsSync(logoPath)) doc.image(logoPath, 50, 38, { width: 50, height: 50 });
    } catch { /* ignore logo errors */ }
    doc.font('Helvetica-Bold').fontSize(19).fillColor('#1a3a5c').text('OPPORTUNITY SCHOOL', 115, 50, { align: 'left' });
    doc.font('Helvetica').fontSize(10.5).fillColor('#333333').text(subtitle, 115, 74);
    doc.strokeColor('#1a3a5c').lineWidth(2).moveTo(50, 78).lineTo(545, 78).stroke();
  };

  let finalY = 30;
  terms.forEach((t, ti) => {
    if (ti === 0) drawHeader('Student Academic Report');
    else { doc.addPage(); drawHeader('Student Academic Report (continued)'); }

    if (ti === 0) {
      doc.font('Helvetica').fontSize(10).fillColor('#333333');
      doc.text(`Name: ${student.name}`, 50, 92);
      doc.text(`Admission No: ${student.admission_no || '—'}`, 50, 106);
      doc.text(`Current Class: ${current.class_name || '—'} (Class Teacher: ${current.class_teacher || '—'})`, 50, 120);
      doc.text(`Parent/Guardian: ${student.parent_name || '—'} ${student.parent_email ? ' <' + student.parent_email + '>' : ''}`, 50, 134);
      doc.text(approvedLine || `Report approved & finalized by: ${student.report_approved_by_name || 'Admin'}`, 50, 148);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a3a5c').text(`${t.name} (${t.year})`, 50, 170);
    } else {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a3a5c').text(`${t.name} (${t.year})`, 50, 92);
    }

    const thY = ti === 0 ? 188 : 106;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
    doc.rect(50, thY, 495, 18).fill('#1a3a5c');
    doc.fillColor('#ffffff');
    doc.text('Subject', 58, thY + 5);
    doc.text('Teachers', 250, thY + 5, { width: 100, align: 'left' });
    doc.text('Total', 378, thY + 5, { width: 40, align: 'right' });
    doc.text('%', 428, thY + 5, { width: 38, align: 'right' });
    doc.text('Grade', 500, thY + 5, { width: 38, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor('#333333');
    let y = thY + 20;
    t.subjects.forEach((s) => {
      doc.text(s.subject_name, 58, y);
      doc.text(s.teachers || '—', 250, y, { width: 100 });
      doc.text(String(s.obtained), 378, y, { width: 40, align: 'right' });
      doc.text(`${s.pct}`, 428, y, { width: 38, align: 'right' });
      doc.font('Helvetica-Bold').text(s.grade || '—', 500, y, { width: 38, align: 'right' });
      doc.font('Helvetica').fontSize(9);
      y += 15;
    });
    doc.font('Helvetica-Bold').text(`Total: ${t.total} / ${t.max}   (${t.pct}%  Grade: ${t.grade || '—'})`, 58, y + 4);

    let dy = y + 22;
    if (dy > 700) { doc.addPage(); dy = 60; drawHeader('Student Academic Report (continued)'); }
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1a3a5c').text('Marks detail (per exam)', 50, dy);
    dy += 4;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
    doc.rect(50, dy, 495, 16).fill('#1a3a5c');
    doc.fillColor('#ffffff');
    doc.text('Exam', 58, dy + 4, { width: 130 });
    doc.text('Subject', 195, dy + 4, { width: 80 });
    doc.text('Class', 280, dy + 4, { width: 60 });
    doc.text('Marks', 348, dy + 4, { width: 42, align: 'right' });
    doc.text('%', 398, dy + 4, { width: 36, align: 'right' });
    doc.text('Grade', 440, dy + 4, { width: 36, align: 'right' });
    doc.text('Teacher', 480, dy + 4, { width: 60 });
    doc.font('Helvetica').fontSize(9).fillColor('#333333');
    dy += 18;
    t.details.forEach((d, idx) => {
      if (dy > 740) { doc.addPage(); dy = 60; drawHeader('Student Academic Report (continued)'); }
      if (idx % 2 === 1) doc.rect(50, dy - 1, 495, 13).fill('#eef2f7');
      doc.fillColor('#333333');
      doc.text(d.exam_name, 58, dy, { width: 130 });
      doc.text(d.subject_name, 195, dy, { width: 80 });
      doc.text(d.class_name || '—', 280, dy, { width: 60 });
      doc.text(String(d.marks_obtained), 348, dy, { width: 42, align: 'right' });
      doc.text(`${d.pct}`, 398, dy, { width: 36, align: 'right' });
      doc.text(d.grade || '—', 440, dy, { width: 36, align: 'right' });
      doc.text(d.teacher || '—', 480, dy, { width: 60 });
      dy += 15;
    });
    dy += 4;
    doc.strokeColor('#cccccc').moveTo(50, dy).lineTo(545, dy).stroke();
    doc.font('Helvetica').fontSize(8.5).fillColor('#888888')
      .text(`Grading: A (81-100) • B (61-80) • C (41-60) • D (21-40) • F (0-20)`, 50, dy + 4);
    finalY = dy + 16;
  });

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a3a5c')
    .text(`Overall (all terms): ${overall.total} / ${overall.max}  (${overall.pct}%  Grade: ${overall.grade || '—'})`, 50, Math.min(finalY + 8, 740), { align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor('#888888')
    .text('Class Teacher Signature: ______________________      Head Teacher Signature: ______________________', 50, Math.min(finalY + 26, 745));
}

module.exports = { writeStudentReportPdf };