# JobTrack - Comprehensive Repository Summary

**Generated:** 17 December 2025  
**Analysis:** Full repository scan and architecture documentation

---

## 🎯 Project Overview

**JobTrack** is a full-stack job search tracking application designed to help job seekers manage their networking, applications, and career search process. Built with Flask (Python) backend and React (TypeScript) frontend, it provides a comprehensive platform for tracking contacts, organizations, job applications, engagement history, and AI-assisted career navigation.

### Core Purpose
- Track recruitment contacts and their organizations
- Manage job applications and interview pipelines
- Log engagement history with contacts
- Organize target companies and networking efforts
- AI-powered career coaching and briefings via Navigator AI
- Import LinkedIn connections and manage leads

---

## 🏗️ Architecture Overview

### Technology Stack

**Backend:**
- **Framework:** Flask 2.0+ (Python 3.9+)
- **Database:** PostgreSQL 17+ with pgcrypto extension
- **ORM/Query:** Raw SQL with psycopg2 + RealDictCursor pattern
- **Authentication:** Session-based with password hashing
- **API:** RESTful JSON endpoints with applicant scoping
- **File Handling:** Database-stored documents with encryption support

**Frontend:**
- **Framework:** React 18 + TypeScript + Vite
- **UI Library:** Material-UI (MUI) v5
- **State Management:** @tanstack/react-query for server state
- **HTTP Client:** Axios with interceptors
- **Testing:** Vitest + React Testing Library
- **Build:** Vite (fast dev server and optimized production builds)

**Infrastructure:**
- **Deployment:** Fly.io (Docker containers)
- **Process Manager:** Gunicorn (production)
- **Database Hosting:** Managed PostgreSQL
- **CI/CD:** GitHub Actions (linting, testing, security scans)

---

## 📊 Database Schema

### Primary Databases

**1. `jobtrack` (Main Application Database)**

Core tables in `database/schema.sql`:

**User & Profile:**
- `applicantprofile` - User accounts with authentication, preferences, search status
- `usersalt` - Per-user encryption salts for key derivation

**Core Entities:**
- `contact` - People (recruiters, colleagues, interviewers) with role types
- `organisation` - Companies with sector classification and talent community flags
- `sector` - Industry/sector reference data
- `lead` - LinkedIn imports pending conversion to contacts
- `jobrole` - Job applications linking contacts to organizations

**Relationships & Logging:**
- `engagementlog` - Timestamped interaction history with encrypted notes
- `contacttargetorganisation` - Many-to-many contact→organization targeting
- `contactdocument` - Document attachments for contacts

**Reference Data:**
- `referencedata` - Application enums (role types, statuses, engagement types)
- Hierarchical structure: `refdataclass` + `refvalue`

**Task Management:**
- `task` - Action items with priorities and deadlines
- `tasktarget` - Polymorphic task associations (contacts, organizations, etc.)

**Documents:**
- `document` - Encrypted file storage with content type and descriptions

**Analytics & Metrics:**
- `applicantmetrichistory` - Time-series metrics for dashboard tracking
- Star schema views: `dim_contact`, `dim_organisation`, `fact_engagement`, etc.

**2. `jobtrack_navigator_ai` (AI Assistant Database)**

Located in `database/jobtrack_navigator_ai_schema.sql`:

- `navigatorbriefing` - AI-generated career briefings
- `navigatoraction` - Recommended actions from AI
- `navigatoractioninput` - User responses to AI prompts
- `aiprompts` - Prompt templates for AI generation
- `aivectors` / `aivectors_1024` - Document embeddings for semantic search

### Key Relationships

```
applicantprofile (1) ←→ (many) contact
contact (many) ←→ (1) organisation [currentorgid]
contact (many) ←→ (many) organisation [via contacttargetorganisation]
contact (1) ←→ (many) engagementlog
contact (1) ←→ (many) jobrole
jobrole (many) ←→ (1) organisation [companyorgid]
organisation (many) ←→ (1) sector
lead (many) ←→ (1) contact [on promotion]
```

---

## 🔧 Backend Architecture (`app.py`)

### Design Patterns

**Database Access:**
```python
class Database:
    """Context manager for PostgreSQL connections"""
    def __enter__(self): return psycopg2.connect(**DB_CONFIG)
    def __exit__(self, exc_type, exc_val, exc_tb):
        # Commit or rollback, then close
```

Pattern: Use `with Database() as conn` throughout the codebase for consistent transaction handling.

**API Response Normalization:**
```python
def jsonify(data):
    """Normalizes legacy DB keys to frontend JSON field names"""
    # Maps: statusid → status_id, engagementtypeid → engagementtype_refid, etc.
```

**Route Structure:**
- Applicant-scoped: `/api/<applicantid>/resource`
- Authentication: Session-based with `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`
- Error handling: Consistent JSON `{"error": "message", "details": {...}}`

### Key Backend Modules

**`app.py` (6400+ lines)**
- Main Flask application entrypoint
- RESTful API endpoints for all resources
- Session management and CORS configuration
- Frontend static file serving (Vite build from `frontend/dist`)
- Video streaming support with Range requests (206 Partial Content)

**`leads.py`**
- Blueprint for LinkedIn connection imports
- ZIP file upload handling (Connections.csv)
- Batch lead creation with duplicate detection
- Lead promotion to contact workflow

**`jobtrack_navigator_ai/` Package**
- AI career coaching endpoints
- Integration with AI providers (OpenAI, Anthropic, Google)
- Briefing generation and action recommendations
- Document embedding and semantic search
- Separate database schema for AI features

**`utils/` Utilities**
- `encryption.py` - Fernet encryption with user-specific key derivation
- `export_utils.py` - XLSX export generation with openpyxl
- Helper functions for common operations

---

## 🎨 Frontend Architecture (`frontend/`)

### Directory Structure

```
frontend/
├── src/
│   ├── api/           # API client and typed interfaces
│   ├── auth/          # Authentication context and helpers
│   ├── components/    # Reusable UI components
│   │   ├── Hub/       # Contact relationship visualization
│   │   └── ...
│   ├── pages/         # Route-mounted pages
│   │   ├── Analytics.tsx
│   │   ├── Contacts.tsx
│   │   ├── Hub.tsx
│   │   ├── Navigator.tsx
│   │   └── ...
│   ├── services/      # Business logic and data services
│   ├── state/         # Shared state management
│   ├── test-utils/    # Test mocks and helpers
│   └── utils/         # Pure utility functions
├── dist/              # Production build output
└── tests/             # Vitest test files
```

### Key Frontend Concepts

**Data Fetching Pattern:**
```typescript
// React Query for server state
const { data, isLoading } = useQuery({
  queryKey: ['contacts', params],
  queryFn: () => api.getContacts(params)
})
```

**API Client (`src/api/client.ts`):**
- Axios instance with interceptors
- Automatic applicant ID injection
- CSRF token handling
- Request/response logging for debugging
- Typed interfaces for all resources

**Authentication:**
- `AuthProvider` context wraps the app
- Current applicant ID stored and injected into requests
- Session-based backend authentication

**Component Philosophy:**
- Presentational components receive data via props
- Data fetching lives in hooks or page components
- MUI `sx` prop for styling
- Testing Library for user-centric tests

### Key Pages

- **Hub** - Visual contact relationship mapping with heat scores
- **Analytics** - Dashboard with metrics and charts
- **Contacts** - Table view with filtering and bulk operations
- **Organizations** - Company management with sector categorization
- **Job Applications** - Pipeline view of application statuses
- **Navigator** - AI career coaching interface with briefings
- **Settings** - User preferences and profile management

---

## 🗄️ Database Migrations

### Migration System

**Location:** `database/migrations/`  
**Naming:** `{number:03d}_{description}.sql` (e.g., `054_add_applicantid_to_data_tables.sql`)  
**Management:** `scripts/migrate.py` for applying migrations  

**Migration Philosophy:**
1. Each migration is numbered sequentially
2. Migrations are immutable once deployed
3. Schema changes applied incrementally
4. `database/schema.sql` kept in sync as canonical reference

**Notable Migrations:**
- **001-010:** Initial schema, core tables, reference data
- **050-053:** Action plan and task system
- **054-055:** Multi-tenant applicant scoping, superuser support
- **056-059:** Networking events, lead system refinements
- **060-063:** Polymorphic relationships, column normalization
- **064-076:** Analytics views, metrics history, navigator AI tables
- **077-079:** Unique constraints, encryption key management

### Migration Workflow

```bash
# Check status
python scripts/migrate.py status

# Apply migrations
python scripts/migrate.py up

# Create new migration
python scripts/migrate.py create "description"

# Update canonical schema after migration
pg_dump --schema-only --no-owner > database/schema.sql
```

---

## 🧪 Testing

### Backend Testing (pytest)

**Location:** `tests/`  
**Framework:** pytest with coverage reporting  
**Key Files:**
- `tests/conftest.py` - Fixtures and FakeDB mock setup
- Test files: `test_api_*.py`, `test_app_*.py`

**Test Patterns:**
```python
@pytest.mark.integration
def test_with_real_db(real_db_connection):
    # Tests that require actual PostgreSQL
    
@pytest.fixture
def fake_db():
    # Mock database for unit tests
```

**Running Tests:**
```bash
./scripts/run-tests.sh python   # Recommended wrapper
pytest -q                        # Direct pytest
pytest -m integration           # Integration tests only
```

**Coverage:** HTML reports generated in `htmlcov/`

### Frontend Testing (Vitest)

**Framework:** Vitest + React Testing Library  
**Patterns:**
- User-centric queries (`getByRole`, `findByLabelText`)
- Mock API responses via `test-utils/testApiMocks.ts`
- AuthProvider mocking for applicant context

**Running Tests:**
```bash
cd frontend
npm run test              # Watch mode
npx vitest run           # Run once
npx vitest run --coverage # With coverage
```

**Test Organization:**
- Component tests: `src/components/**/__tests__/`
- Page tests: `src/pages/__tests__/`
- Integration tests: `tests/` (root level)

---

## 🚀 Deployment & Infrastructure

### Local Development

**Backend:**
```bash
# Start Flask dev server
./scripts/start-server.sh start

# With debug logging
./scripts/start-server.sh start DEBUG 1
```

**Frontend:**
```bash
cd frontend
npm run dev   # Vite dev server on :5173
```

**Database:**
```bash
# Setup local DB
./scripts/setup_jobtrack_db.sh

# Run migrations
python scripts/migrate.py up

# Seed test data
psql -d jobtrack -f database/prime_test_db.sql
```

### Production (Fly.io)

**Configuration:** `fly.toml`
- Region: London (lhr)
- Memory: 1GB
- Auto-scaling: 0-N machines
- HTTPS enforced
- Internal port: 8080 (Gunicorn)

**Dockerfile:**
- Multi-stage build
- Frontend compiled in Node stage
- Python runtime with system dependencies
- Frontend static assets copied to Flask app
- Gunicorn as production server

**Deployment:**
```bash
./scripts/deploy.sh         # Full deployment
fly deploy                  # Direct Fly CLI
```

**Environment Variables (Fly Secrets):**
- `DATABASE_URL` - PostgreSQL connection string
- `FLASK_SECRET_KEY` - Session signing key
- `JOBTRACK_PG_KEY` - Database encryption key
- `CORS_ORIGINS` - Allowed frontend origins
- AI provider keys (optional)

---

## 🔐 Security Features

### Encryption
- **Database encryption:** pgcrypto for sensitive fields
- **User-specific keys:** Derived from password + salt (Fernet)
- **Engagement log notes:** Encrypted at rest
- **Document content:** Optional encryption support

### Authentication
- **Password hashing:** Werkzeug's `generate_password_hash`
- **Session management:** Flask sessions with secure cookies
- **CSRF protection:** Token-based validation
- **Rate limiting:** Flask-Limiter (optional Redis backing)

### Data Isolation
- **Applicant scoping:** All data queries filtered by `applicantid`
- **Multi-tenancy:** Each user's data logically separated
- **Superuser flag:** Admin access for cross-applicant operations

---

## 🛠️ Developer Scripts (`scripts/`)

### Essential Scripts

**Database Management:**
- `db-manager.sh backup` - Create timestamped backup
- `db-manager.sh restore <file>` - Restore from backup
- `db-manager.sh status` - Show table counts
- `migrate.py` - Apply database migrations

**Development:**
- `start-server.sh start` - Launch Flask dev server
- `start-frontend-dev.sh` - Launch Vite dev server
- `run-tests.sh python` - Run backend tests
- `run_local_docker.sh` - Build and run Docker locally

**CI/CD:**
- `deploy.sh` - Deploy to Fly.io
- `pre-commit.sh` - Run linters and formatters
- `build_seed_test_docker.sh` - Full CI test orchestration

**Data Tools:**
- `import_roles_from_csv.py` - Bulk job role import
- `export_reference_data.py` - Extract reference data

---

## 📦 Dependencies

### Backend (Python)

**Core:**
- Flask 2.0+ - Web framework
- psycopg2-binary - PostgreSQL adapter
- gunicorn - Production WSGI server

**AI & ML:**
- transformers 4.34+ - Hugging Face models
- cryptography 39+ - Fernet encryption
- requests - HTTP client

**Utilities:**
- Pillow - Image processing for avatars
- openpyxl - Excel export generation
- PyPDF2 - PDF handling

**Dev Tools:**
- pytest - Testing framework
- black - Code formatter
- mypy - Type checker
- flake8 - Linter
- bandit - Security scanner

### Frontend (JavaScript/TypeScript)

**Core:**
- react 18 - UI framework
- react-dom 18 - DOM rendering
- typescript 5+ - Type safety
- vite 5+ - Build tool

**UI:**
- @mui/material 5+ - Component library
- @emotion/react - CSS-in-JS
- @mui/icons-material - Icon set

**Data:**
- @tanstack/react-query 5+ - Server state
- axios 1+ - HTTP client

**Testing:**
- vitest - Test runner
- @testing-library/react - Component testing
- @testing-library/user-event - User interaction simulation

---

## 🎯 Key Features

### Contact Management
- Track recruiters, colleagues, and networking contacts
- Link contacts to their current organizations
- Assign role types (Recruiter, Friend, etc.)
- Track LinkedIn connection status
- Visual relationship mapping in Hub view

### Organization Tracking
- Company database with sector classification
- Talent community membership flags
- Target organization lists per contact
- Search and filter capabilities

### Job Application Pipeline
- Track applications through multiple statuses
- Link applications to contacts and companies
- Document interview history
- CV submission tracking

### Engagement Logging
- Timestamped interaction history
- Encrypted notes for privacy
- Engagement type categorization
- Follow-up reminders

### AI Navigator
- Career coaching briefings
- Personalized action recommendations
- Document analysis and insights
- Semantic search across documents

### Lead Management
- Import LinkedIn connections (ZIP upload)
- Review and categorize leads
- Promote leads to full contacts
- Track connection dates and outcomes

### Analytics & Insights
- Dashboard with key metrics
- Application pipeline visualization
- Engagement frequency tracking
- Search duration monitoring

### Document Management
- Upload and store documents
- Type categorization (CV, Cover Letter, etc.)
- Link documents to contacts
- Encrypted storage option

---

## 🔄 Data Flow Examples

### 1. Contact Creation Flow
```
Frontend (Contacts.tsx)
  → POST /api/<applicantid>/contacts
    → app.py handler validates input
      → Database INSERT with applicantid scope
        → Returns new contact with contactid
          → Frontend invalidates query cache
            → UI updates with new contact
```

### 2. LinkedIn Import Flow
```
User uploads Connections.zip
  → POST /api/<applicantid>/leads/import
    → leads.py extracts CSV from ZIP
      → Parses rows, validates data
        → Batch INSERT into lead table
          → Returns import summary
            → Frontend displays results
```

### 3. AI Briefing Generation
```
User requests briefing
  → POST /api/navigator/generate-briefing
    → jobtrack_navigator_ai queries user data
      → Calls AI provider API
        → Parses AI response
          → Stores in navigatorbriefing table
            → Returns formatted briefing
              → Frontend displays with actions
```

---

## 🐛 Known Patterns & Conventions

### Backend Conventions
- **Error responses:** Always return `{"error": "...", "details": {...}}`
- **Date format:** `YYYY-MM-DD` for API dates
- **Applicant scoping:** Every route includes `applicantid` in path or validates from session
- **Transactions:** Use `with Database() as conn` + explicit `conn.commit()`
- **Logging:** Use module-level loggers, set level via `LOG_LEVEL` env var

### Frontend Conventions
- **Query keys:** `['resource', params]` pattern for React Query
- **File naming:** `ComponentName.tsx`, `ComponentName.spec.tsx`
- **Props:** Prefer explicit prop interfaces over inline types
- **Imports:** Absolute imports from `src/`
- **Styling:** MUI `sx` prop, avoid external CSS where possible

### Database Conventions
- **Primary keys:** Explicit sequences + `SET DEFAULT nextval(...)`
- **Foreign keys:** Use descriptive names (`currentorgid`, `contactid`)
- **Constraints:** `NOT NULL`, `UNIQUE`, `CHECK` declared inline where simple
- **Indexes:** Created in migrations when query performance requires
- **Comments:** Table and column comments for documentation

---

## 📚 Documentation Locations

- **Backend guide:** `/README.md`
- **Frontend guide:** `/frontend/README.md`
- **Database guide:** `/database/README.md`
- **AI assistant instructions:** `/.github/copilot-instructions.md`
- **Secrets management:** `/docs/SECRETS.md`
- **Migration workflow:** Section in `/database/README.md`

---

## 🚦 Getting Started (New Developer)

### Prerequisites
- Python 3.9+
- Node.js 18+
- PostgreSQL 15+
- Git

### Setup Steps

1. **Clone and install dependencies:**
```bash
git clone <repo-url>
cd jobTrack

# Backend
python -m venv venv
source venv/bin/activate
pip install -e .

# Frontend
cd frontend
npm install
```

2. **Configure environment:**
```bash
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL and keys
```

3. **Setup database:**
```bash
./scripts/setup_jobtrack_db.sh
python scripts/migrate.py up
psql -d jobtrack -f database/prime_test_db.sql
```

4. **Run application:**
```bash
# Terminal 1: Backend
./scripts/start-server.sh start

# Terminal 2: Frontend
cd frontend
npm run dev
```

5. **Access application:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:8080/api

### First Time User
- Register account at `/login`
- Import LinkedIn connections (optional)
- Add first contact manually
- Explore Hub view for relationship mapping

---

## 🔍 Code Quality & CI

### Linters & Formatters
- **Backend:** black, isort, flake8, mypy
- **Frontend:** ESLint, Prettier (via Vite)

### Security Scanning
- **Python:** bandit (SAST), safety (dependency audit)
- **JavaScript:** npm audit

### Pre-commit Checks
```bash
./scripts/pre-commit.sh  # Run all checks
```

### CI Pipeline (GitHub Actions)
1. Lint and format checks
2. Type checking (mypy, tsc)
3. Security scans
4. Unit tests
5. Integration tests (with test DB)
6. Build verification

---

## 🎓 Learning Resources

### Understanding the Codebase
1. Start with `app.py` - main application entry
2. Review `database/schema.sql` - data model
3. Read `frontend/src/api/client.ts` - API integration
4. Explore `frontend/src/pages/Hub.tsx` - complex UI example
5. Check tests for usage patterns

### Key Concepts to Learn
- Flask blueprints for modular routes
- PostgreSQL pgcrypto for encryption
- React Query for server state management
- MUI component customization
- Multi-tenancy with applicant scoping

---

## 📈 Future Enhancements (from codebase analysis)

### Noted TODOs
- Improved lead deduplication algorithms
- Enhanced AI prompt engineering
- Real-time collaboration features
- Mobile-responsive improvements
- Batch operations for contact management

### Architectural Opportunities
- GraphQL API layer consideration
- WebSocket support for real-time updates
- Service worker for offline capabilities
- Microservice extraction for AI features
- Enhanced caching strategies

---

## 📞 Support & Maintenance

### Monitoring
- Application logs via Flask logger
- Database query performance monitoring
- Fly.io metrics dashboard
- Sentry integration (optional)

### Backup Strategy
- Automated daily backups via `db-manager.sh`
- Fly.io volume snapshots
- Retention policy: 30 days

### Troubleshooting Guide
1. Check logs: Fly.io dashboard or `fly logs`
2. Database connection: Verify `DATABASE_URL`
3. Frontend build: Check `frontend/dist/` exists
4. Migrations: Run `python scripts/migrate.py status`
5. Tests: Run full suite locally to reproduce

---

## 🏁 Conclusion

JobTrack is a mature, production-ready application with:
- ✅ Solid architecture with clear separation of concerns
- ✅ Comprehensive testing at backend and frontend
- ✅ Security-first approach with encryption and isolation
- ✅ Modern tech stack with active maintenance
- ✅ Extensive documentation and developer tooling
- ✅ Scalable multi-tenant design
- ✅ AI-enhanced features via Navigator
- ✅ Production deployment on Fly.io

The codebase follows industry best practices, has good test coverage, and is well-documented. New developers should find it straightforward to onboard using the provided scripts and documentation.

**Repository Statistics:**
- ~6,400 lines: Backend (Python)
- ~15,000+ lines: Frontend (TypeScript/React)
- ~1,600 lines: Database schema
- 79 migrations applied
- 150+ API endpoints
- 50+ React components

---

*This document was generated through comprehensive repository analysis and serves as a living reference for developers working on JobTrack.*
