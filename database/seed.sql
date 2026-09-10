-- ============================================================================
-- School Management System - Seed Data
-- Provides sample data for testing.
--
-- Default logins (password all hashed with bcrypt):
--   Admin   : admin@school.com   / Admin@123
--   Teacher : teacher1@school.com / Teacher@123
--             teacher2@school.com / Teacher@123
--   Parent  : parent1@school.com / Parent@123
--             parent2@school.com / Parent@123
--
-- Run AFTER schema.sql:  mysql -u root -p < database/seed.sql
-- ============================================================================

USE school_management;

-- ============================================================================
-- USERS
-- ============================================================================
INSERT INTO users (id, name, email, password, role, phone, is_active) VALUES
(1, 'System Admin',     'admin@school.com',    '$2a$10$W9BTyNHMF5gueNzqcw11ZuR2qysuMCatVSP.qB8YcWV0TArn/ZuKm', 'admin',   '+1-555-0001', 1),
(2, 'John Smith',       'teacher1@school.com', '$2a$10$1z5ZgntCXcrtb9kAtlvAB./abeBMP/pmGxpteR1cv6OprAnqLcP0W', 'teacher', '+1-555-1001', 1),
(3, 'Mary Johnson',     'teacher2@school.com', '$2a$10$1z5ZgntCXcrtb9kAtlvAB./abeBMP/pmGxpteR1cv6OprAnqLcP0W', 'teacher', '+1-555-1002', 1),
(4, 'Robert Williams',  'teacher3@school.com', '$2a$10$1z5ZgntCXcrtb9kAtlvAB./abeBMP/pmGxpteR1cv6OprAnqLcP0W', 'teacher', '+1-555-1003', 1),
(5, 'Sarah Davis',      'parent1@school.com',  '$2a$10$dP6gxo8JZjSYPXOcFo00n.d2P0IvcgcgjU5dTLQ8sH1.jq0OSSPw6', 'parent',  '+1-555-2001', 1),
(6, 'David Brown',      'parent2@school.com',  '$2a$10$dP6gxo8JZjSYPXOcFo00n.d2P0IvcgcgjU5dTLQ8sH1.jq0OSSPw6', 'parent',  '+1-555-2002', 1);

-- ============================================================================
-- TEACHERS
-- ============================================================================
INSERT INTO teachers (id, user_id, employee_no, qualification, experience_years, hire_date) VALUES
(1, 2, 'T-1001', 'B.Sc Mathematics, M.Ed', 8, '2018-09-01'),
(2, 3, 'T-1002', 'BA English Literature, PGCE', 5, '2019-09-01'),
(3, 4, 'T-1003', 'B.Sc Physics, M.Sc', 10, '2015-09-01');

-- ============================================================================
-- PARENTS
-- ============================================================================
INSERT INTO parents (id, user_id, relationship, occupation) VALUES
(1, 5, 'mother', 'Nurse'),
(2, 6, 'father', 'Engineer');

-- ============================================================================
-- ACADEMIC YEARS & TERMS
-- ============================================================================
INSERT INTO academic_years (id, name, start_date, end_date, is_active) VALUES
(1, '2024-2025', '2024-09-01', '2025-06-30', 1),
(2, '2025-2026', '2025-09-01', '2026-06-30', 0);

INSERT INTO terms (id, academic_year_id, name) VALUES
(1, 1, 'Term 1'),
(2, 1, 'Term 2'),
(3, 1, 'Term 3');

-- ============================================================================
-- CLASSES
-- ============================================================================
INSERT INTO classes (id, name, section, description) VALUES
(1, 'Grade 5', 'A', 'Elementary'),
(2, 'Grade 6', 'A', 'Elementary'),
(3, 'Grade 7', 'A', 'Middle School');

-- ============================================================================
-- SUBJECTS
-- ============================================================================
INSERT INTO subjects (id, name, code) VALUES
(1, 'Mathematics', 'MATH'),
(2, 'English', 'ENG'),
(3, 'Science', 'SCI'),
(4, 'Social Studies', 'SOC'),
(5, 'Computer Studies', 'CS');

-- ============================================================================
-- CLASS-TEACHER-SUBJECT ASSIGNMENTS
-- ============================================================================
INSERT INTO class_teacher_assignments (class_id, teacher_id, subject_id) VALUES
(1, 1, 1),  -- Grade 5 -> John Smith -> Math
(1, 2, 2),  -- Grade 5 -> Mary Johnson -> English
(2, 1, 1),  -- Grade 6 -> John Smith -> Math
(2, 3, 3),  -- Grade 6 -> Robert Williams -> Science
(3, 2, 2),  -- Grade 7 -> Mary Johnson -> English
(3, 3, 3);  -- Grade 7 -> Robert Williams -> Science

-- ============================================================================
-- STUDENTS
-- ============================================================================
INSERT INTO students (id, parent_user_id, admission_no, name, date_of_birth, gender, enrollment_date, status) VALUES
(1, 5, 'S-2024-0001', 'Emma Davis', '2014-03-15', 'female', '2024-09-01', 'active'),
(2, 5, 'S-2024-0002', 'Liam Davis', '2013-07-22', 'male',   '2024-09-01', 'active'),
(3, 6, 'S-2024-0003', 'Noah Brown', '2012-11-02', 'male',   '2024-09-01', 'active'),
(4, 6, 'S-2025-0004', 'Ava Brown',  '2011-05-19', 'female', '2025-01-10', 'active');

-- ============================================================================
-- STUDENT-CLASS ENROLLMENTS
-- ============================================================================
INSERT INTO student_class_enrollments (student_id, class_id, term_id) VALUES
(1, 1, 1),  -- Emma in Grade 5 Term 1
(2, 2, 1),  -- Liam in Grade 6 Term 1
(3, 3, 1),  -- Noah in Grade 7 Term 1
(4, 3, 1);  -- Ava in Grade 7 Term 1

-- ============================================================================
-- ADMISSION APPLICATIONS (a pending one for demo)
-- ============================================================================
INSERT INTO admission_applications
  (parent_user_id, student_name, date_of_birth, gender, grade_applying,
   previous_school, previous_grade, status)
VALUES
  (5, 'Sophie Davis', '2015-01-10', 'female', 'Grade 4',
   'Sunrise Elementary', 'Grade 3', 'pending');

-- ============================================================================
-- EXAMINATIONS
-- ============================================================================
INSERT INTO examinations (id, class_id, term_id, name, date, max_marks) VALUES
(1, 1, 1, 'End of Term 1 Exam', '2024-12-15', 100),
(2, 2, 1, 'End of Term 1 Exam', '2024-12-15', 100),
(3, 3, 1, 'End of Term 1 Exam', '2024-12-15', 100);

-- ============================================================================
-- MARKS (sample results for Term 1)
-- ============================================================================
-- Exam 1 = Grade 5 (Emma Davis, student 1)
INSERT INTO marks (exam_id, student_id, subject_id, marks_obtained, grade, remarks) VALUES
(1, 1, 1, 92.00, 'A', 'Excellent work'),
(1, 1, 2, 85.00, 'A', 'Very good'),
(1, 1, 3, 88.00, 'A', 'Great understanding'),
(1, 1, 4, 78.00, 'B', 'Good effort'),
(1, 1, 5, 95.00, 'A', 'Outstanding');

-- Exam 2 = Grade 6 (Liam Davis, student 2)
INSERT INTO marks (exam_id, student_id, subject_id, marks_obtained, grade, remarks) VALUES
(2, 2, 1, 74.00, 'B', 'Shows improvement'),
(2, 2, 2, 68.00, 'B', 'Needs to read more'),
(2, 2, 3, 81.00, 'A', 'Strong in science'),
(2, 2, 4, 65.00, 'B', 'Fair'),
(2, 2, 5, 72.00, 'B', 'Good');

-- Exam 3 = Grade 7 (Noah Brown, student 3; Ava Brown, student 4)
INSERT INTO marks (exam_id, student_id, subject_id, marks_obtained, grade, remarks) VALUES
(3, 3, 1, 55.00, 'C', 'Needs extra help with algebra'),
(3, 3, 2, 62.00, 'B', 'Satisfactory'),
(3, 3, 3, 70.00, 'B', 'Good'),
(3, 4, 1, 90.00, 'A', 'Excellent'),
(3, 4, 2, 88.00, 'A', 'Very good'),
(3, 4, 3, 76.00, 'B', 'Good');

-- ============================================================================
-- ATTENDANCE (sample: 5 days for each student)
-- ============================================================================
INSERT INTO attendance (student_id, class_id, date, status, marked_by) VALUES
(1, 1, '2024-12-09', 'present', 2),
(1, 1, '2024-12-10', 'present', 2),
(1, 1, '2024-12-11', 'late',    2),
(1, 1, '2024-12-12', 'present', 2),
(1, 1, '2024-12-13', 'present', 2),
(2, 2, '2024-12-09', 'present', 1),
(2, 2, '2024-12-10', 'absent',  1),
(2, 2, '2024-12-11', 'present', 1),
(2, 2, '2024-12-12', 'present', 1),
(2, 2, '2024-12-13', 'excused', 1),
(3, 3, '2024-12-09', 'present', 2),
(3, 3, '2024-12-10', 'present', 2),
(3, 3, '2024-12-11', 'present', 2),
(3, 3, '2024-12-12', 'late',    2),
(3, 3, '2024-12-13', 'present', 2),
(4, 3, '2024-12-09', 'absent',  2),
(4, 3, '2024-12-10', 'present', 2),
(4, 3, '2024-12-11', 'present', 2),
(4, 3, '2024-12-12', 'present', 2),
(4, 3, '2024-12-13', 'present', 2);

-- ============================================================================
-- TEACHER COMMENTS
-- ============================================================================
INSERT INTO teacher_comments (student_id, term_id, teacher_id, comment) VALUES
(1, 1, 1, 'Emma is an outstanding student. She participates actively and shows great leadership skills.'),
(2, 1, 1, 'Liam is making steady progress. He should focus more on reading comprehension.'),
(3, 1, 2, 'Noah is friendly and hardworking. Needs to improve his algebra confidence.'),
(4, 1, 2, 'Ava has adjusted well and is performing excellently across all subjects.');

-- ============================================================================
-- MESSAGES (sample notifications)
-- ============================================================================
INSERT INTO messages (sender_id, subject, body, audience, recipient_id) VALUES
(1, 'Welcome to the new academic year', 'Dear parents, welcome to the 2024-2025 academic year. We look forward to a great year together.', 'all_parents', NULL),
(1, 'Staff meeting reminder', 'There will be a staff meeting on Monday at 3 PM in the conference room.', 'all_teachers', NULL),
(1, 'Grade 5 field trip', 'The Grade 5 field trip to the Science Museum is scheduled for Friday. Please ensure permission slips are returned.', 'user', 5);
