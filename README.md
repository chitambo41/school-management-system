# Opportunity School Management System

A complete, modern, web-based **School Management System for Opportunity School** with three user roles:
**Parents/Guardians**, **Teachers**, and **Admin**.

Built with a beginner-friendly stack:

- **Backend:** Node.js + Express.js (session-based auth, bcrypt password hashing)
- **Frontend:** HTML, CSS, **Bootstrap 5**, vanilla JavaScript, EJS templates
- **Database:** MySQL (relational schema with foreign keys and indexes)
- **Email:** Nodemailer (optional — logs to console when not configured)
- **Uploads:** Multer for admission document uploads

---

## Features

### Auth & Roles
- Registration (parents can self-register), login/logout, password reset (token via email)
- Role-based dashboards and access control (RBAC middleware)
- Admin can create/delete teacher accounts

### Parent / Guardian
- Apply for student admission (student details, previous records, documents upload)
- Track application status (Pending / Approved / Rejected)
- View child profile, exam results (subject-wise marks), academic progress
- View attendance summary and teacher comments
- Receive messages from the school

### Teacher
- See assigned classes and subjects, and student lists
- Mark/update attendance per class and day (present/absent/late/excused)
- Enter and edit examination marks per subject (grading computed automatically)
- View class results and ranking
- Write per-term student comments

### Admin
- Dashboard overview (students, teachers, classes, pending applications)
- Approve / reject admission applications (creates students automatically)
- Full CRUD on students, teachers, classes, subjects
- Assign teachers to classes & subjects
- Manage academic years and terms
- Create examinations and view results overview
- Send messages to one user, all teachers, all parents, or everyone
- Generate basic reports (attendance summary, subject averages)
- Activity log of important actions

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org) 18+ (includes npm)
- [MySQL](https://dev.mysql.com/downloads/) 8+ running locally

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Then edit `.env` — at minimum set your MySQL credentials:

```ini
DB_HOST=localhost
DB_PORT=3306
DB_NAME=school_management
DB_USER=root
DB_PASSWORD=your_password
```

Optionally set `SMTP_*` values to enable real email notifications
(pending/reset links). Leave them blank in development — emails are
logged to the console instead.

### 3. Create the database and load seed data

**Option A — automatic (recommended):**

```bash
npm run db:init
```

**Option B — manual (mysql CLI / phpMyAdmin):**

```sql
SOURCE database/schema.sql;
SOURCE database/seed.sql;
```

Both options create the `school_management` database, all tables, and
sample data.

### 4. Start the server

```bash
npm start          # production
npm run dev        # development (auto-restart with nodemon)
```

Open <http://localhost:3000>

---

## Demo Accounts

| Role    | Email                  | Password      |
|---------|------------------------|---------------|
| Admin   | admin@school.com       | Admin@123     |
| Teacher | teacher1@school.com    | Teacher@123   |
| Teacher | teacher2@school.com    | Teacher@123   |
| Parent  | parent1@school.com     | Parent@123    |
| Parent  | parent2@school.com     | Parent@123    |

> When a real SMTP server is configured, new teacher accounts get a
> password reset flow via email; otherwise the passwords above work.

### Sample data included
- 4 students (2 linked to parent1, 2 to parent2)
- Grade 5, 6, 7 classes · 5 subjects · 3 teacher assignments
- Term 1 exam results with grades for every student
- 5 days of attendance per student
- Pending admission application (submitted by parent1) for testing the
  Admin approval flow
- Sample messages to parents and teachers

---

## Project Structure

```
school-management-system/
├── server.js                 # entry point (starts server + checks DB)
├── app.js                    # Express app setup, routes, error handling
├── package.json
├── .env.example              # environment template
├── database/
│   ├── schema.sql            # full MySQL schema (DDL)
│   ├── seed.sql              # sample data
│   └── init.js               # npm run db:init script
├── config/
│   ├── db.js                 # MySQL connection pool
│   └── mailer.js             # Nodemailer wrapper
├── middleware/
│   ├── auth.js               # session/RBAC middleware
│   ├── upload.js             # multer file upload config
│   └── helpers.js            # async wrapper, grading, activity log
├── models/
│   ├── index.js              # shared DB helpers
│   └── User.js               # user operations
├── controllers/
│   ├── authController.js     # register/login/reset
│   ├── adminController.js    # admin features
│   ├── teacherController.js  # teacher features
│   └── parentController.js   # parent features
├── routes/
│   ├── auth.js
│   ├── admin.js
│   ├── teacher.js
│   └── parent.js
└── views/
    ├── layouts/main.ejs      # global layout (sidebar + topbar)
    ├── partials/             # sidebar, topbar, flash
    ├── auth/                 # login, register, forgot, reset
    ├── admin/                # dashboard + admin pages
    ├── teacher/              # dashboard + teacher pages
    ├── parent/               # dashboard + parent pages
    ├── index.ejs             # public landing page
    ├── 404.ejs / 500.ejs
```

---

## Database Schema Highlights

Core tables (see `database/schema.sql` for full DDL):

- `users` — one table for all roles (`admin`, `teacher`, `parent`)
- `parents` / `teachers` — role profiles that link to `users`
- `students` — enrolled students, linked to a parent user
- `admission_applications` — pending/approved/rejected flow
- `classes`, `subjects`, `academic_years`, `terms`
- `class_teacher_assignments` — who teaches what, in which class
- `student_class_enrollments` — student ↔ class ↔ term
- `attendance` — per student per day (unique on student+date)
- `examinations` — exams per class/term with max marks
- `marks` — student × subject × exam results (unique composite key)
- `teacher_comments` — per-term comments
- `messages` + `message_recipients` — fan-out inbox with read status
- `activity_logs` — audit trail
- `password_resets` — token-based reset

Foreign keys are used throughout (e.g. `ON DELETE CASCADE`) and
frequently queried columns are indexed.

---

## Security Measures

- **Password hashing** with bcrypt (cost factor 10)
- **Session-based auth** with `httpOnly` cookies and role checks on every route
- **SQL injection** prevention — all queries use prepared statements (`?` placeholders)
- **XSS protection** — EJS auto-escapes output (`<%= %>` blocks)
- **CSRF hardening** — same-site cookies; all state-changing actions use POST forms
- **Helmet** sets secure HTTP headers
- **Multer** restricts upload sizes and file types
- **Input validation** on both frontend (Bootstrap `required`, JS) and backend (`express-validator`)
- **Soft deletes** (`deleted_at`) preserve data for audit purposes

---

## Customizing / Extending

- **Add a field:** update `database/schema.sql`, then refresh with `npm run db:init` (rebuilds DB).
- **New role screens:** add routes in `routes/`, handlers in `controllers/`, templates in `views/`, and sidebar links in `views/partials/sidebar.ejs`.
- **Reports:** extend `adminController.reports()` and `views/admin/reports.ejs`.
- **PDF export:** install `pdfmake`/`puppeteer` and add a print endpoint.
- **Fee status:** add a `fees` table and show it on the parent dashboards.
- **Dark mode:** toggle a `data-theme` attribute and add CSS variables.

See the comments inside each controller for pointers on where to add things.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `MySQL connection OK` never prints | Check `.env` DB settings and that MySQL is running |
| `ER_BAD_DB_ERROR` | Run `npm run db:init` first |
| Port already in use | Change `PORT` in `.env` |
| Emails not sending | SMTP vars are blank → check server console where emails are logged, or configure `SMTP_*` |
| Can't login as admin | Confirm you ran `seed.sql` |#   s c h o o l - m a n a g e m e n t -  
 