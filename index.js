import express from "express";
import session from "express-session";
import "dotenv/config";
import pg from "pg";
import bcrypt from "bcrypt";

const app = express();
const port = process.env.SERVER_PORT;
const connectionString = process.env.DB_URL;

// Variables
var journalEntries = [];
var userId = 0;
var journalEntries = [];
var journalEntry = {};
var emptyJournal = { title: "Add New Journal", text: "Nothing here yet..." };
var editMode = false;
var journalId = 0;
var saltRounds = parseInt(process.env.SALTROUNDS);

// Serve static files to server and ejs
app.use(express.static("public"));

// Mount middleware (so we can intercept requests)
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_KEY,
    resave: false,
    saveUninitialized: true,
  })
);

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  } else {
    res.redirect("/login");
  }
}

// Connect to database
const pool = new pg.Pool({
  connectionString,
});

app.get("/", (req, res) => {
  res.render("index.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.post("/register", async (req, res) => {
  const username = req.body.username.toLowerCase();
  const password = req.body.password.toLowerCase();
  try {
    bcrypt.hash(password, saltRounds, async function (err, hash) {
      // Store hash in your password DB.
      const insertUser = await pool.query(
        "INSERT INTO users (username, password) VALUES ($1, $2);",
        [username, hash]
      );
    });
    res.redirect("/login");
  } catch (err) {
    console.log("User already exists.");
    res.redirect("/register");
  }
});

app.post("/login", async (req, res) => {
  const usernameEntered = req.body.username.toLowerCase();
  const passwordEntered = req.body.password.toLowerCase();
  try {
    const userExistsQuery = await pool.query(
      "SELECT count(id) FROM users WHERE username = $1;",
      [usernameEntered]
    );
    const userExists = parseInt(userExistsQuery.rows[0].count);
    // If user exists
    if (userExists === 1) {
      // Load hash from your password DB.
      const hashQuery = await pool.query(
        "SELECT password from users WHERE username = $1;",
        [usernameEntered]
      );
      const hash = hashQuery.rows[0].password;
      bcrypt.compare(passwordEntered, hash, async function (err, result) {
        // If password is correct
        if (result) {
          const userIdQuery = await pool.query(
            "SELECT id FROM users WHERE username = $1;",
            [usernameEntered]
          );
          userId = userIdQuery.rows[0].id;
          res.redirect("/journal");
        }
        // If password is incorrect
        else {
          console.log("Password is incorrect.");
          res.redirect("/login");
        }
      });
    } // If user doesn't exist
    else if (userExists === 0) {
      console.log("User doesn't exist.");
      res.redirect("/login");
    } // Something else
    else {
      console.log("A DB error has occurred.");
      res.redirect("/login");
    }
  } catch (err) {
    console.error(err);
    res.redirect("/login");
  }
});

app.get("/journal", isAuthenticated, async (req, res) => {
  try {
    const journalEntriesQuery = await pool.query(
      "SELECT * FROM journal_items WHERE user_id = $1 ORDER BY id ASC;",
      [userId]
    );
    journalEntries = journalEntriesQuery.rows;
    if (journalEntries.length === 0) {
      res.render("journal.ejs", {
        journalEntries: journalEntries,
        journalEntry: emptyJournal,
        editMode: editMode,
      });
    } else {
      const foundObject = journalEntries.find(
        (item) => JSON.stringify(item) === JSON.stringify(journalEntry)
      );
      if (!foundObject) {
        journalEntry = journalEntries.slice(-1)[0];
      }
      res.render("journal.ejs", {
        journalEntries: journalEntries,
        journalEntry: journalEntry,
        editMode: editMode,
      });
    }
  } catch (err) {
    console.error(err);
    res.redirect("/login");
  }
});

app.post("/journal-entry", async (req, res) => {
  const journalItemTitle = req.body["journal-entry-title"];
  const journalItemText = req.body["journal-entry-text"];
  try {
    const journalIdQuery = await pool.query(
      "SELECT id FROM journal_items WHERE title = $1 AND text = $2;",
      [journalItemTitle, journalItemText]
    );
    journalId = journalIdQuery.rows[0].id;
    const journalEntryQuery = await pool.query(
      "SELECT * FROM journal_items WHERE id = $1;",
      [journalId]
    );
    journalEntry = journalEntryQuery.rows[0];
  } catch (err) {
    console.error(err);
  }
  res.redirect("/journal");
});

app.post("/new-entry", async (req, res) => {
  const newEntry = {
    title: req.body["new-entry-title"],
    text: req.body["new-entry-text"],
  };
  try {
    const insertNewJournalEntry = await pool.query(
      "INSERT INTO journal_items (user_id, title, text) VALUES ($1, $2, $3);",
      [userId, newEntry.title, newEntry.text]
    );
    journalEntry = newEntry;
  } catch (err) {
    console.error(err);
  }
  res.redirect("/journal");
});

app.post("/start-editing", async (req, res) => {
  const journalItemTitle = req.body["edit-button-title"];
  const journalItemText = req.body["edit-button-text"];
  try {
    const journalIdQuery = await pool.query(
      "SELECT id FROM journal_items WHERE title = $1 AND text = $2;",
      [journalItemTitle, journalItemText]
    );
    journalId = journalIdQuery.rows[0].id;
    const journalEntryQuery = await pool.query(
      "SELECT * FROM journal_items WHERE id = $1;",
      [journalId]
    );
    journalEntry = journalEntryQuery.rows[0];
    editMode = true;
  } catch (err) {
    console.error(err);
  }
  res.redirect("/journal");
});

app.post("/cancel-editing", (req, res) => {
  editMode = false;
  res.redirect("/journal");
});

app.post("/delete-entry", async (req, res) => {
  console.log(req.body);
  try {
    const deleteJournalItem = await pool.query(
      "DELETE FROM journal_items WHERE id = $1;",
      [journalId]
    );
  } catch (err) {
    console.error(err);
  }
  editMode = false;
  res.redirect("/journal");
});

app.post("/finish-editing", async (req, res) => {
  const updatedJournalTitle = req.body["edit-entry-title"];
  const updatedJournalText = req.body["edit-entry-text"];
  try {
    const updateRecordQuery = await pool.query(
      "UPDATE journal_items SET title = $1, text = $2 WHERE id = $3;",
      [updatedJournalTitle, updatedJournalText, journalId]
    );
  } catch (err) {
    console.error(err);
  }
  editMode = false;
  res.redirect("/journal");
});

app.listen(port, function () {
  console.log(`Server listening on port ${port}.`);
});
