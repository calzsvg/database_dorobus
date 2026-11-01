# Dorobus PostgreSQL Database

This directory contains the initial database schema for Dorobus: **17 tables and 100 columns** covering users, classes, learning activities, story progress, CELL currency, and furniture ownership.

The schema and sample data have been tested with an embedded PostgreSQL engine (PGlite). This is an initial schema for review; it has not been applied to the production database or connected to the React application. See the [validation report](docs/validation.md) for the test scope.

Start with the [ER diagram](docs/erd.md) for relationships and the [table definitions](docs/table-definitions.md) for column details. To create the tables, follow either Section 3 or Section 4 below.

## Files

```text
database/
├── README.md                      # Database overview and setup instructions
├── migrations/
│   └── 001_init.sql               # Creates the schema, tables, constraints, and indexes
├── examples/
│   └── 001_demo_data.sql          # Optional sample users, classes, attempts, and purchases
├── checks/
│   ├── 001_verify.sql             # Reads and displays the setup results
│   └── 002_constraints.sql        # Tests constraints, then rolls back the test data
└── docs/
    ├── erd.md                     # Entity relationships
    ├── table-definitions.md       # Columns, data types, keys, and descriptions
    ├── design-proposal.md         # Design rationale
    └── validation.md              # Validation results and scope
```

## 1. Database Structure

### Database, schema, and table

- **Database:** The overall storage space for the project. The development database in this guide is named `dorobus_dev`.
- **Schema:** A group of related objects inside a database. The initialization script creates a schema named `dorobus`.
- **Table:** A collection of records of the same kind, such as users or assignments.

For example, `dorobus.users` means the `users` table inside the `dorobus` schema. Running the SQL creates this structure; storing the SQL files in the repository does not create a database by itself.

### Table groups

| Area | Tables | What they store |
|---|---|---|
| Users and settings | `users`, `player_profiles` | Student and teacher accounts, current selections, and game preferences |
| Courses and classes | `courses`, `class_groups`, `enrollments` | Reusable course definitions, actual classes, and student enrollment |
| Learning | `contents`, `content_versions`, `assignments`, `learning_attempts`, `content_completions` | Activities, their published versions, class assignments, submitted answers, and first completions |
| Story | `story_steps`, `user_story_progress` | Shared story steps and each user's completed steps |
| CELL and furniture | `wallets`, `cell_transactions`, `items`, `user_items`, `reward_claims` | Current balances, currency changes, furniture definitions, ownership, and claimed rewards |

### How the main relationships work

- A **course** defines the learning content. A **class** runs that course for a particular teacher and period. `enrollments` connects students to classes.
- An **activity** can be reused across classes. `assignments` connects a class to a specific activity version, preserving what was assigned at the time.
- Each submitted answer creates a **learning attempt**. The first successful completion is stored separately in `content_completions`. Under this design, that completion is shared across classes using the same activity.
- A **story step** is defined once. `user_story_progress` records which users have completed it.
- A **wallet** stores the current CELL balance. `cell_transactions` explains why it changed. `reward_claims` prevents the same user from claiming the same reward twice.
- An **item** describes a furniture type. `user_items` connects that item to its owner. Each user can own a furniture type once.

The main user flow is: **enroll in a class → submit an answer → complete an activity → receive CELL → buy furniture**. Each part of that flow has its own records, linked by user and activity identifiers. Creating the tables does not automatically perform these actions; the application must coordinate the related writes in a transaction.

## 2. Requirements

1. A running **PostgreSQL 16 or later** server. The included scripts were tested with PostgreSQL 18.6 through PGlite; run the checks on the team's actual server version as well.
2. A database account with permission to create a database and its objects, or an existing development database where the account can create a schema.
3. Either a database tool with an SQL editor or the PostgreSQL command-line client, `psql`.

The examples use `localhost`, port `5432`, and user `postgres`. Replace these values with your own connection settings. Enter passwords through your connection tool rather than writing them into these files.

If the team has already provided a development database, skip database creation and connect to that database directly.

## 3. Setup Using an SQL Editor

### Step 1: Create a development database

Connect to the existing `postgres` database and execute this statement separately:

```sql
CREATE DATABASE dorobus_dev;
```

`CREATE DATABASE` cannot run inside a transaction, so it is not included in the initialization file. Use autocommit mode or your tool's database creation interface if needed. If `dorobus_dev` already exists, use the intended development database or choose another name.

### Step 2: Connect to the new database

Change the connection's database from `postgres` to `dorobus_dev`. Confirm the connection before continuing:

```sql
SELECT current_database(), current_user;
```

### Step 3: Run the initialization script

Open [migrations/001_init.sql](migrations/001_init.sql) and execute the **entire file**, from `BEGIN` through `COMMIT`.

The script creates the `dorobus` schema, all 17 tables, their constraints, update triggers, and indexes. The table order already accounts for foreign-key dependencies; there is no need to execute individual tables manually.

If an error occurs, the new objects in this transaction are not committed. Run `ROLLBACK;` in the same connection to end the failed transaction before correcting the issue and retrying.

Run the initialization script **once per new database**. After a successful run, executing it again intentionally fails because the `dorobus` schema already exists. Record later schema changes in a new migration, such as `migrations/002_add_feature.sql`.

### Step 4: Verify the tables

Run [checks/001_verify.sql](checks/001_verify.sql). The first two queries should return:

| Result | Expected value |
|---|---:|
| `table_count` | 17 |
| `column_count` | 100 |

The script also lists table descriptions, constraints, and the two `updated_at` triggers. In your database browser, expand the **`dorobus` schema** to find the tables. Refresh the object list if necessary.

### Step 5: Try the sample data (optional)

Run [examples/001_demo_data.sql](examples/001_demo_data.sql) once in the development database, then run `checks/001_verify.sql` again.

The sample student starts with 300 CELL, receives a 50 CELL completion reward, and buys furniture for 200 CELL.

| Sample result | Expected value |
|---|---:|
| Final CELL balance | 150 |
| Transaction total | 150 |
| Balance minus transaction total | 0 |
| Answer submissions | 3 |
| Incorrect submissions | 2 |
| Furniture owned | 1 |

The `demo-only:` identifiers are fictional and do not create real login accounts. Re-running the sample script produces a duplicate-record error and rolls back that run.

### Step 6: Check the constraints

Run [checks/002_constraints.sql](checks/002_constraints.sql) in the development database. It checks that 24 invalid operations are rejected, including duplicate rewards, negative balances, and mismatched assignment versions. It also checks valid operations and automatic timestamp updates.

Look for `PASS` messages in your tool's output or messages panel. The final **`ROLLBACK` is expected**: it removes the temporary test records even when the checks pass. An unexpected error means the checks did not complete successfully.

## 4. Setup Using the Terminal

This is an alternative to Section 3. Run the commands from the **repository root**, with this directory located at `database/`. If `psql` is unavailable, use the SQL editor instructions above or configure the installed PostgreSQL client's executable path.

Replace the example connection settings as needed. Run each command after the previous one succeeds.

```bash
# 1. Create the development database only if it does not already exist.
psql -X -h localhost -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE dorobus_dev;'

# 2. Required: create the schema and tables.
psql -X -h localhost -p 5432 -U postgres -d dorobus_dev -v ON_ERROR_STOP=1 -f database/migrations/001_init.sql

# 3. Verify the structure: expect 17 tables and 100 columns.
psql -X -h localhost -p 5432 -U postgres -d dorobus_dev -v ON_ERROR_STOP=1 -f database/checks/001_verify.sql

# 4. Optional: insert sample data, then verify the sample results.
psql -X -h localhost -p 5432 -U postgres -d dorobus_dev -v ON_ERROR_STOP=1 -f database/examples/001_demo_data.sql
psql -X -h localhost -p 5432 -U postgres -d dorobus_dev -v ON_ERROR_STOP=1 -f database/checks/001_verify.sql

# 5. Check constraints; the temporary test records are rolled back.
psql -X -h localhost -p 5432 -U postgres -d dorobus_dev -v ON_ERROR_STOP=1 -f database/checks/002_constraints.sql
```

Option meanings:

- `-h`, `-p`, `-U`, `-d`: Host, port, user, and target database.
- `-f`: Execute the specified SQL file.
- `-v ON_ERROR_STOP=1`: Stop if a statement fails.
- `-X`: Ignore personal `psql` startup settings.

The SQL files already contain their own transaction boundaries, so do not add `--single-transaction` to these commands.

References: [psql](https://www.postgresql.org/docs/current/app-psql.html), [transactions](https://www.postgresql.org/docs/current/sql-begin.html), and [CREATE DATABASE](https://www.postgresql.org/docs/current/sql-createdatabase.html).

## 5. Table Creation Order

Foreign keys refer to records in other tables, so the referenced tables must exist first. The initialization script already follows this order:

| Stage | Tables or objects, in execution order |
|---|---|
| 1. Shared definitions | `users` → `courses` → `contents` → `story_steps` → `items` |
| 2. Classes and assignments | `class_groups` → `enrollments` → `content_versions` → `assignments` |
| 3. Learning and progress | `learning_attempts` → `content_completions` → `user_story_progress` → `player_profiles` |
| 4. Currency and ownership | `wallets` → `cell_transactions` → `user_items` → `reward_claims` |
| 5. Supporting objects | Automatic `updated_at` triggers and query indexes |

For the complete relationships and column rules, see the [ER diagram](docs/erd.md) and [table definitions](docs/table-definitions.md).
