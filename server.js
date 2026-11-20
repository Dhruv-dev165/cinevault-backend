const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Change this secret admin password before deploying!
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Support@2026';

const DATA_FILE = path.join(__dirname, 'data', 'movies.json');

app.use(cors());
app.use(express.json());

// Serve ONLY the private admin panel from backend
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// Helper to read movies
function readMovies() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, '[]', 'utf8');
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading movies.json:', err);
    return [];
  }
}

// Helper to write movies
function writeMovies(movies) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(movies, null, 2), 'utf8');
}

// Middleware to verify Admin Password header
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-password'];
  if (!token || token !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Admin Password' });
  }
  next();
}

// PUBLIC API: Get all movies (supports ?category=... & ?search=...)
app.get('/api/movies', (req, res) => {
  let movies = readMovies();
  const { category, search, quality } = req.query;

  if (category && category !== 'All') {
    movies = movies.filter(m => m.category.toLowerCase() === category.toLowerCase());
  }

  if (quality && quality !== 'All') {
    movies = movies.filter(m => m.links && m.links[quality] && m.links[quality].trim() !== '');
  }

  if (search && search.trim() !== '') {
    const q = search.toLowerCase();
    movies = movies.filter(m =>
      m.title.toLowerCase().includes(q) ||
      (m.synopsis && m.synopsis.toLowerCase().includes(q)) ||
      (m.language && m.language.toLowerCase().includes(q))
    );
  }

  res.json(movies);
});

// PUBLIC API: Get single movie by ID
app.get('/api/movies/:id', (req, res) => {
  const movies = readMovies();
  const movie = movies.find(m => m.id === req.params.id);
  if (!movie) {
    return res.status(404).json({ error: 'Movie not found' });
  }
  res.json(movie);
});

// ADMIN API: Verify Login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true, message: 'Authenticated' });
  }
  return res.status(401).json({ success: false, error: 'Wrong Admin Password' });
});

// ADMIN API: Add new movie with 480p, 720p, 1080p links
app.post('/api/movies', requireAdmin, (req, res) => {
  const { title, category, year, qualityTag, language, size, poster, synopsis, links } = req.body;

  if (!title || !links || (!links['480p'] && !links['720p'] && !links['1080p'])) {
    return res.status(400).json({ error: 'Title and at least one download link (480p/720p/1080p) are required.' });
  }

  const movies = readMovies();
  const newMovie = {
    id: 'mov_' + Date.now(),
    title: title.trim(),
    category: category || 'Bollywood',
    year: year || '2026',
    qualityTag: qualityTag || '1080p WEB-DL',
    language: language || 'Hindi / Dual Audio',
    size: size || '450MB / 950MB / 2.2GB',
    poster: poster && poster.trim() !== ''
      ? poster.trim()
      : 'https://placehold.co/400x600/151a24/e11d48?text=' + encodeURIComponent(title.slice(0, 20)),
    synopsis: synopsis || 'Full HD movie available for direct download in 480p, 720p, and 1080p.',
    links: {
      '480p': links['480p'] ? links['480p'].trim() : '',
      '720p': links['720p'] ? links['720p'].trim() : '',
      '1080p': links['1080p'] ? links['1080p'].trim() : ''
    },
    createdAt: new Date().toISOString()
  };

  movies.unshift(newMovie);
  writeMovies(movies);

  res.status(201).json({ success: true, movie: newMovie });
});

// ADMIN API: Delete movie
app.delete('/api/movies/:id', requireAdmin, (req, res) => {
  const movies = readMovies();
  const filtered = movies.filter(m => m.id !== req.params.id);

  if (filtered.length === movies.length) {
    return res.status(404).json({ error: 'Movie not found' });
  }

  writeMovies(filtered);
  res.json({ success: true, message: 'Movie deleted' });
});

app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(` CineVault Backend API running on http://localhost:${PORT}`);
  console.log(` Private Admin Panel: http://localhost:${PORT}/admin`);
  console.log(`=================================================`);
});
