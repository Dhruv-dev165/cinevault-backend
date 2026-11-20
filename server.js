require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const MONGODB_URI = (process.env.MONGODB_URI || '').trim();
const DATA_FILE = path.join(__dirname, 'data', 'movies.json');

app.use(cors());
app.use(express.json());

// Private Admin Panel routes
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});
app.get('/admin/', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

const movieSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  category: { type: String, default: 'Bollywood' },
  year: { type: String, default: '2026' },
  qualityTag: { type: String, default: '1080p WEB-DL' },
  language: { type: String, default: 'Hindi / Dual Audio' },
  size: { type: String, default: '450MB / 980MB / 2.2GB' },
  poster: { type: String, default: '' },
  synopsis: { type: String, default: '' },
  links: {
    '480p': { type: String, default: '' },
    '720p': { type: String, default: '' },
    '1080p': { type: String, default: '' }
  },
  createdAt: { type: String, default: () => new Date().toISOString() }
});

const MovieModel = mongoose.model('Movie', movieSchema);
let useMongo = false;

function readJsonMovies() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, '[]', 'utf8');
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    console.error('Error reading movies.json:', err);
    return [];
  }
}

function writeJsonMovies(movies) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(movies, null, 2), 'utf8');
}

async function initDatabase() {
  if (!MONGODB_URI) {
    console.log('MONGODB_URI not set -> Using data/movies.json');
    return;
  }
  try {
    await mongoose.connect(MONGODB_URI);
    useMongo = true;
    console.log('Connected to MongoDB Atlas.');
    const count = await MovieModel.countDocuments();
    if (count === 0) {
      const seed = readJsonMovies();
      if (seed.length > 0) await MovieModel.insertMany(seed);
    }
  } catch (err) {
    useMongo = false;
    console.error('MongoDB connection error, using JSON fallback:', err.message);
  }
}

async function getMovies() {
  if (useMongo) return await MovieModel.find({}).sort({ createdAt: -1 }).lean();
  return readJsonMovies();
}

async function addMovie(movie) {
  if (useMongo) {
    const doc = await MovieModel.create(movie);
    return doc.toObject();
  }
  const list = readJsonMovies();
  list.unshift(movie);
  writeJsonMovies(list);
  return movie;
}

async function removeMovie(id) {
  if (useMongo) {
    const res = await MovieModel.deleteOne({ id });
    return res.deletedCount > 0;
  }
  const list = readJsonMovies();
  const next = list.filter(m => m.id !== id);
  if (next.length === list.length) return false;
  writeJsonMovies(next);
  return true;
}

function requireAdmin(req, res, next) {
  const pass = req.headers['x-admin-password'];
  if (!pass || pass !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Admin Password' });
  }
  next();
}

// Root route (/)
app.get('/', (req, res) => {
  res.json({
    message: 'CineVault Backend is Live!',
    admin: '/admin',
    moviesApi: '/api/movies',
    health: '/api/health'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, storage: useMongo ? 'MongoDB Atlas' : 'JSON' });
});

app.get('/api/movies', async (req, res) => {
  try {
    let movies = await getMovies();
    const { category, quality, search } = req.query;

    if (category && category !== 'All') {
      movies = movies.filter(m => m.category && m.category.toLowerCase() === category.toLowerCase());
    }
    if (quality && quality !== 'All') {
      movies = movies.filter(m => m.links && m.links[quality] && m.links[quality].trim() !== '');
    }
    if (search && search.trim() !== '') {
      const q = search.toLowerCase();
      movies = movies.filter(m =>
        (m.title && m.title.toLowerCase().includes(q)) ||
        (m.language && m.language.toLowerCase().includes(q)) ||
        (m.synopsis && m.synopsis.toLowerCase().includes(q))
      );
    }
    res.json(movies);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch movies' });
  }
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) return res.json({ success: true });
  return res.status(401).json({ success: false, error: 'Wrong Admin Password' });
});

app.post('/api/movies', requireAdmin, async (req, res) => {
  try {
    const { title, category, year, qualityTag, language, size, poster, synopsis, links } = req.body;
    if (!title || !links || (!links['480p'] && !links['720p'] && !links['1080p'])) {
      return res.status(400).json({ error: 'Title and at least one quality link (480p/720p/1080p) required.' });
    }
    const newMovie = {
      id: 'mov_' + Date.now(),
      title: title.trim(),
      category: category || 'Bollywood',
      year: year || '2026',
      qualityTag: qualityTag || '1080p WEB-DL',
      language: language || 'Hindi / Dual Audio',
      size: size || '450MB / 980MB / 2.2GB',
      poster: poster && poster.trim() !== ''
        ? poster.trim()
        : 'https://placehold.co/400x600/151a24/e11d48?text=' + encodeURIComponent(title.slice(0, 20)),
      synopsis: synopsis || 'Free direct download available in 480p, 720p, and 1080p.',
      links: {
        '480p': links['480p'] ? links['480p'].trim() : '',
        '720p': links['720p'] ? links['720p'].trim() : '',
        '1080p': links['1080p'] ? links['1080p'].trim() : ''
      },
      createdAt: new Date().toISOString()
    };
    const saved = await addMovie(newMovie);
    res.status(201).json({ success: true, movie: saved });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save movie' });
  }
});

app.delete('/api/movies/:id', requireAdmin, async (req, res) => {
  try {
    const ok = await removeMovie(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Movie not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete movie' });
  }
});

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`CineVault Backend running on port ${PORT}`);
  });
});
