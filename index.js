require('dotenv').config();
const express = require('express');
const axios = require('axios');
const querystring = require('querystring');

const app = express();

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI;

// ⚠️ MVP: token i minnet (räcker för nu)
let access_token = null;
let user_id = null;


/* =====================
   ROOT
===================== */
app.get('/', (req, res) => {
  res.send(`
    <h1>Auralytics Backend</h1>
    <ul>
      <li><a href="/login">Login with Spotify</a></li>
      <li><a href="/top-tracks">Get Top Tracks</a></li>
    </ul>
  `);
});

/* =====================
   LOGIN
===================== */
app.get('/login', (req, res) => {
  const scope =
    'user-read-private user-read-email user-top-read playlist-modify-private playlist-modify-public';

  const authUrl =
    'https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id,
      scope,
      redirect_uri
    });

  res.redirect(authUrl);
});

/* =====================
   CALLBACK
===================== */
app.get('/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send('No code received');
  }

  try {
    const tokenResponse = await axios.post(
      'https://accounts.spotify.com/api/token',
      querystring.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' +
            Buffer.from(client_id + ':' + client_secret).toString('base64')
        }
      }
    );

    access_token = tokenResponse.data.access_token;

    const userResponse = await axios.get(
      'https://api.spotify.com/v1/me',
      {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      }
    );
    user_id = userResponse.data.id; // Spara user_id om det behövs senare


    res.json({
      user: userResponse.data,
      token: access_token
    });
  } catch (err) {
    res.status(400).json(err.response?.data || err.message);
  }
});

/* =====================
   TOP TRACKS
===================== */
app.get('/top-tracks', async (req, res) => {
  if (!access_token) {
    return res.status(401).json({ error: 'Not authenticated. Login first.' });
  }

  try {
    const response = await axios.get(
      'https://api.spotify.com/v1/me/top/tracks',
      {
        headers: {
          Authorization: `Bearer ${access_token}`
        },
        params: {
          limit: 20,
          time_range: 'medium_term'
        }
      }
    );

    res.json(response.data);
  } catch (err) {
    res.status(400).json(err.response?.data || err.message);
  }
});
app.get('/create-playlist', async (req, res) => {
  if (!access_token || !user_id) {
    return res.status(401).json({ error: 'Login first' });
  }

  try {
    // 1. Get top tracks
    const topTracksResponse = await axios.get(
      'https://api.spotify.com/v1/me/top/tracks',
      {
        headers: {
          Authorization: `Bearer ${access_token}`
        },
        params: {
          limit: 20,
          time_range: 'medium_term'
        }
      }
    );

    const trackUris = topTracksResponse.data.items.map(
      track => track.uri
    );

    // 2. Create playlist
    const playlistResponse = await axios.post(
      `https://api.spotify.com/v1/users/${user_id}/playlists`,
      {
        name: 'Auralytics – My Top Tracks',
        description: 'Auto-generated playlist based on your listening history',
        public: false
      },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const playlistId = playlistResponse.data.id;

    // 3. Add tracks
    await axios.post(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      {
        uris: trackUris
      },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({
      success: true,
      playlistUrl: playlistResponse.data.external_urls.spotify
    });
  } catch (err) {
    res.status(400).json(err.response?.data || err.message);
  }
});


/* =====================
   START SERVER
===================== */
app.listen(8888, () => {
  console.log('Auralytics backend running on http://localhost:8888');
});
