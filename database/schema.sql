-- ============================================================================
-- School Management System - Database Schema
-- MySQL 8.0+
-- Run this file in phpMyAdmin or via: mysql -u root -p < database/schema.sql
-- ============================================================================

CREATE DATABASE IF NOT EXISTS school_management
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE school_management;

-- ============================================================================
-- USERS (single table for Auth - all three roles)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120)  NOT NULL,
  email         VARCHAR(190)  NOT NULL UNIQUE,
  password      VARCHAR(255)  NOT NULL,          -- bcrypt hash
  role          ENUM('admin','teacher','parent') NOT NULL DEFAULT 'parent',
  phone         VARCHAR(30)   NULL,
  avatar        VARCHAR(255)  NULL,
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  last_login    DATETIME      NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME      NULL,              -- soft delete
  INDEX idx_users_role (role),
  INDEX idx_users_email (email)
) ENGINE=InnoDB;

-- ============================================================================
-- ACADEMIC YEARS
-- e.g. 2024-2025
-- ============================================================================
CREATE TABLE IF NOT EXISTS academic_years (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(20) NOT NULL UNIQUE,       -- e.g. '2024-2025'
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================================
-- TERMS (e.g. Term 1, Term 2, Term 3 within an academic year)
-- ============================================================================
CREATE TABLE IF NOT EXISTS terms (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  academic_year_id INT UNSIGNED NOT NULL,
  name             VARCHAR(40) NOT NULL,         -- e.g. 'Term 1'
  is_active        TINYINT(1) NOT NULL DEFAULT 0, -- only one active term at a time
  start_date       DATE NULL,
  end_date         DATE NULL,
  CONSTRAINT fk_terms_year FOREIGN KEY (academic_year_id)
    REFERENCES academic_years(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- CLASSES (e.g. Grade 5, Grade 6)
-- ============================================================================
CREATE TABLE IF NOT EXISTS classes (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(80) NOT NULL,            -- e.g. 'Grade 5'
  section       VARCHAR(20) NULL,                -- e.g. 'A'
  description   TEXT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME NULL,
  UNIQUE KEY uq_class (name, section)
) ENGINE=InnoDB;

-- ============================================================================
-- SUBJECTS (e.g. Mathematics, English)
-- ============================================================================
CREATE TABLE IF NOT EXISTS subjects (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(80) NOT NULL UNIQUE,
  code       VARCHAR(20) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL
) ENGINE=InnoDB;

-- ============================================================================
-- TEACHERS (profile linked to users.role = 'teacher')
-- ============================================================================
CREATE TABLE IF NOT EXISTS teachers (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  employee_no   VARCHAR(20) NOT NULL UNIQUE,
  qualification VARCHAR(120) NULL,
  experience_years INT NULL,
  address       VARCHAR(255) NULL,
  hire_date     DATE NULL,
  is_head       TINYINT(1) NOT NULL DEFAULT 0,   -- head teacher / coordinator
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME NULL,
  CONSTRAINT fk_teachers_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_teachers_user (user_id)
) ENGINE=InnoDB;

-- ============================================================================
-- PARENTS / GUARDIANS (profile linked to users.role = 'parent')
-- ============================================================================
CREATE TABLE IF NOT EXISTS parents (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  relationship ENUM('mother','father','guardian','other') NOT NULL DEFAULT 'guardian',
  occupation   VARCHAR(120) NULL,
  address      VARCHAR(255) NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at   DATETIME NULL,
  CONSTRAINT fk_parents_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_parents_user (user_id)
) ENGINE=InnoDB;

-- ============================================================================
-- ADMISSION APPLICATIONS (parent applies for a student before approval)
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_applications (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  parent_user_id   INT UNSIGNED NOT NULL,
  student_name     VARCHAR(120) NOT NULL,
  date_of_birth    DATE NOT NULL,
  gender           ENUM('male','female','other') NOT NULL,
  grade_applying   VARCHAR(40) NOT NULL,          -- e.g. 'Grade 5'
  previous_school  VARCHAR(150) NULL,
  previous_grade   VARCHAR(40) NULL,
  address          VARCHAR(255) NULL,
  documents        TEXT NULL,                     -- JSON array of uploaded file paths
  status           ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  admin_note       TEXT NULL,
  reviewed_by      INT UNSIGNED NULL,
  reviewed_at      DATETIME NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_applications_parent FOREIGN KEY (parent_user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_applications_admin FOREIGN KEY (reviewed_by)
    REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_applications_parent (parent_user_id),
  INDEX idx_applications_status (status)
) ENGINE=InnoDB;

-- ============================================================================
-- STUDENTS (enrolled students)
-- ============================================================================
CREATE TABLE IF NOT EXISTS students (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  parent_user_id    INT UNSIGNED NULL,            -- linked parent (guardian)
  application_id    INT UNSIGNED NULL,            -- origin application
  admission_no      VARCHAR(20) NOT NULL UNIQUE,
  name              VARCHAR(120) NOT NULL,
  date_of_birth     DATE NOT NULL,
  gender            ENUM('male','female','other') NOT NULL,
  address           VARCHAR(255) NULL,
  photo             VARCHAR(255) NULL,
  previous_school   VARCHAR(150) NULL,
  enrollment_date   DATE NULL,
  status            ENUM('active','graduated','transferred','dropped') NOT NULL DEFAULT 'active',
  report_approved_at DATETIME NULL,        -- report approved & printed by admin (parent may download)
  report_approved_by INT UNSIGNED NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at        DATETIME NULL,
  CONSTRAINT fk_students_parent FOREIGN KEY (parent_user_id)
    REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_students_application FOREIGN KEY (application_id)
    REFERENCES admission_applications(id) ON DELETE SET NULL,
  CONSTRAINT fk_students_report_by FOREIGN KEY (report_approved_by)
    REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_students_parent (parent_user_id),
  INDEX idx_students_status (status)
) ENGINE=InnoDB;

-- ============================================================================
-- CLASS-TEACHER-SUBJECT ASSIGNMENTS
-- A teacher teaches a subject in a specific class
-- ============================================================================
CREATE TABLE IF NOT EXISTS class_teacher_assignments (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id   INT UNSIGNED NOT NULL,
  teacher_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NULL,     -- NULL = class teacher (homeroom) role
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cta_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_cta_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_cta_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  UNIQUE KEY uq_cta (class_id, teacher_id, subject_id),
  INDEX idx_cta_teacher (teacher_id),
  INDEX idx_cta_class (class_id)
) ENGINE=InnoDB;

-- ============================================================================
-- STUDENT-CLASS ENROLLMENTS (which class a student is in, per term)
-- ============================================================================
CREATE TABLE IF NOT EXISTS student_class_enrollments (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  class_id   INT UNSIGNED NOT NULL,
  term_id    INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sce_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_sce_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_sce_term FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE,
  UNIQUE KEY uq_sce (student_id, class_id, term_id),
  INDEX idx_sce_class (class_id),
  INDEX idx_sce_term (term_id)
) ENGINE=InnoDB;

-- ============================================================================
-- ATTENDANCE (per student per day)
-- ============================================================================
CREATE TABLE IF NOT EXISTS attendance (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id  INT UNSIGNED NOT NULL,
  class_id    INT UNSIGNED NOT NULL,
  date        DATE NOT NULL,
  status      ENUM('present','absent','late','excused') NOT NULL DEFAULT 'present',
  note        VARCHAR(255) NULL,
  marked_by   INT UNSIGNED NULL,                  -- teacher user id
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_att_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_att_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_att_teacher FOREIGN KEY (marked_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_att (student_id, date),
  INDEX idx_att_class_date (class_id, date),
  INDEX idx_att_date (date)
) ENGINE=InnoDB;

-- ============================================================================
-- EXAMINATIONS (an exam held in a term)
-- ============================================================================
CREATE TABLE IF NOT EXISTS examinations (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id    INT UNSIGNED NOT NULL,
  term_id     INT UNSIGNED NOT NULL,
  name        VARCHAR(80) NOT NULL,               -- e.g. 'End of Term Exam'
  date        DATE NULL,
  max_marks   SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_exam_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_exam_term FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE,
  INDEX idx_exam_term (term_id),
  INDEX idx_exam_class (class_id)
) ENGINE=InnoDB;

-- ============================================================================
-- MARKS / RESULTS (per student per subject per exam)
-- ============================================================================
CREATE TABLE IF NOT EXISTS marks (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  exam_id         INT UNSIGNED NOT NULL,
  student_id      INT UNSIGNED NOT NULL,
  subject_id      INT UNSIGNED NOT NULL,
  marks_obtained  DECIMAL(5,2) NOT NULL,
  grade           VARCHAR(5) NULL,                -- computed A/B/C/D/F
  remarks         VARCHAR(255) NULL,
  entered_by      INT UNSIGNED NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_marks_exam FOREIGN KEY (exam_id) REFERENCES examinations(id) ON DELETE CASCADE,
  CONSTRAINT fk_marks_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_marks_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  CONSTRAINT fk_marks_teacher FOREIGN KEY (entered_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_mark (exam_id, student_id, subject_id),
  INDEX idx_marks_student (student_id),
  INDEX idx_marks_exam (exam_id)
) ENGINE=InnoDB;

-- ============================================================================
-- TERM RESULT SUBMISSIONS (class teacher confirms -> admin reviews)
-- ============================================================================
CREATE TABLE IF NOT EXISTS term_result_submissions (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id     INT UNSIGNED NOT NULL,
  term_id      INT UNSIGNED NOT NULL,
  status       ENUM('draft','submitted','approved','revision') NOT NULL DEFAULT 'draft',
  submitted_by INT UNSIGNED NULL,
  submitted_at DATETIME NULL,
  reviewed_by  INT UNSIGNED NULL,
  reviewed_at  DATETIME NULL,
  admin_note   TEXT NULL,
  CONSTRAINT fk_trs_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_trs_term FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE,
  CONSTRAINT fk_trs_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_trs_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_trs (class_id, term_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- TEACHER COMMENTS (academic progress / reports)
-- ============================================================================
CREATE TABLE IF NOT EXISTS teacher_comments (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id  INT UNSIGNED NOT NULL,
  term_id     INT UNSIGNED NOT NULL,
  teacher_id  INT UNSIGNED NOT NULL,
  comment     TEXT NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tc_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_tc_term FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE,
  CONSTRAINT fk_tc_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  UNIQUE KEY uq_tc (student_id, term_id, teacher_id)
) ENGINE=InnoDB;

-- ============================================================================
-- MESSAGES / NOTIFICATIONS
-- Can be to individual user, all teachers, or all parents
-- ============================================================================
CREATE TABLE IF NOT EXISTS messages (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sender_id   INT UNSIGNED NULL,                  -- admin or system
  subject     VARCHAR(150) NOT NULL,
  body        TEXT NOT NULL,
  audience    ENUM('user','all_teachers','all_parents','all_users') NOT NULL DEFAULT 'user',
  recipient_id INT UNSIGNED NULL,                 -- for audience='user'
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_msg_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_msg_audience (audience),
  INDEX idx_msg_recipient (recipient_id)
) ENGINE=InnoDB;

-- ============================================================================
-- MESSAGE RECIPIENTS (fan-out: who actually received/read a message)
-- ============================================================================
CREATE TABLE IF NOT EXISTS message_recipients (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  message_id  INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  is_read     TINYINT(1) NOT NULL DEFAULT 0,
  read_at     DATETIME NULL,
  CONSTRAINT fk_mr_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_mr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_mr (message_id, user_id),
  INDEX idx_mr_user (user_id)
) ENGINE=InnoDB;

-- ============================================================================
-- ACTIVITY LOGS (audit trail for important admin actions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NULL,
  action      VARCHAR(100) NOT NULL,              -- e.g. 'admission.approved'
  description TEXT NULL,
  ip_address  VARCHAR(45) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_log_user (user_id),
  INDEX idx_log_action (action)
) ENGINE=InnoDB;

-- ============================================================================
-- PASSWORD RESET TOKENS
-- ============================================================================
CREATE TABLE IF NOT EXISTS password_resets (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  token      VARCHAR(255) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used       TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_pr_token (token)
) ENGINE=InnoDB;
