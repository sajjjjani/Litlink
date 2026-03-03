const COVER_GRADIENTS = [
  ['#5A2E1F', '#3E2723'],
  ['#4A3B32', '#2C3E50'],
  ['#2C3E50', '#1A252C'],
  ['#8B4513', '#5A2E1F'],
  ['#2F4F4F', '#1C2F2F'],
  ['#800000', '#4A0000'],
  ['#556B2F', '#2E3B19'],
  ['#4682B4', '#23415A'],
  ['#A0522D', '#5A2E1F'],
  ['#483D8B', '#241E45'],
  ['#2F4F4F', '#000000'],
  ['#DAA520', '#8B6508'],
  ['#1B4332', '#0A1F15'],
  ['#4A235A', '#2C1340'],
  ['#154360', '#0D2B3E'],
];

// ── Genre metadata: descriptions, discussion seeds, sidebar content
const GENRE_META = {
  fantasy: {
    desc: 'Journey beyond the veil of reality. Discover epic sagas, intricate magic systems, and worlds where dragons soar and ancient prophecies unfold.',
    icon: '🐉',
    color: '#5A2E1F',
    discussions: [
      { id: 101, title: 'Best magic systems in 2024?', replies: 142, lastActive: '2 min ago', user: 'DragonRider99' },
      { id: 102, title: 'Underrated fantasy authors you need to read', replies: 89, lastActive: '1 hour ago', user: 'BookWizard' },
      { id: 103, title: 'The Ember Throne – Chapter 12 Spoilers', replies: 256, lastActive: '5 min ago', user: 'PageTurner' },
      { id: 104, title: 'Grimdark vs High Fantasy: Which do you prefer?', replies: 114, lastActive: '30 min ago', user: 'DarkFantasyFan' },
      { id: 105, title: 'Looking for dragon rider recommendations', replies: 67, lastActive: '15 min ago', user: 'RiderOfDragons' },
    ],
    reviewed: [
      { id: 201, title: 'The Name of the Wind', author: 'Patrick Rothfuss', rating: 4.8, reviews: 12453, gradient: ['#4A3B32','#5A2E1F'] },
      { id: 202, title: 'Mistborn', author: 'Brandon Sanderson', rating: 4.7, reviews: 9876, gradient: ['#2C3E50','#5A2E1F'] },
      { id: 203, title: 'The Way of Kings', author: 'Brandon Sanderson', rating: 4.9, reviews: 15678, gradient: ['#5A2E1F','#3E2723'] },
    ],
    voiceRooms: [
      { id: 301, name: 'Fantasy Book Club', participants: 24, topic: 'Discussing "The Name of the Wind"' },
      { id: 302, name: 'Worldbuilding Workshop', participants: 12, topic: 'Creating magic systems' },
      { id: 303, name: 'Spoiler Zone: Ember Throne', participants: 8, topic: 'Chapter 12-15 discussion' },
    ],
    activeReaders: 156
  },
  mystery: {
    desc: 'Unravel the threads of deception. Dive into shadowy tales of crime, suspense, and detective genius where every clue counts.',
    icon: '🔍',
    color: '#2C3E50',
    discussions: [
      { id: 401, title: 'Best detective novels of all time?', replies: 198, lastActive: '10 min ago', user: 'DetectiveDan' },
      { id: 402, title: 'Cozy mysteries vs hard-boiled noir', replies: 77, lastActive: '45 min ago', user: 'MysteryLover' },
      { id: 403, title: 'Agatha Christie vs Arthur Conan Doyle', replies: 311, lastActive: '5 min ago', user: 'SherlockFan' },
      { id: 404, title: 'Underrated mystery authors 2024', replies: 55, lastActive: '2 hours ago', user: 'BookDetective' },
      { id: 405, title: 'Most shocking plot twists in mysteries?', replies: 143, lastActive: '20 min ago', user: 'TwistSeeker' },
    ],
    reviewed: [
      { id: 501, title: 'Gone Girl', author: 'Gillian Flynn', rating: 4.5, reviews: 23456, gradient: ['#2C3E50','#1A252C'] },
      { id: 502, title: 'The Girl with the Dragon Tattoo', author: 'Stieg Larsson', rating: 4.6, reviews: 18765, gradient: ['#3E2723','#1C1C1C'] },
      { id: 503, title: 'Big Little Lies', author: 'Liane Moriarty', rating: 4.4, reviews: 14567, gradient: ['#4A235A','#2C1340'] },
    ],
    voiceRooms: [
      { id: 601, name: 'Mystery Book Club', participants: 18, topic: 'Discussing "Gone Girl"' },
      { id: 602, name: 'Cold Case Discussions', participants: 9, topic: 'Unsolved mysteries in fiction' },
      { id: 603, name: 'Plot Twist Theory Crafting', participants: 14, topic: 'Predicting endings' },
    ],
    activeReaders: 98
  },
  romance: {
    desc: 'Open your heart to stories of love, longing, and connection. From sweeping historical romance to modern love stories that leave you breathless.',
    icon: '❤️',
    color: '#800000',
    discussions: [
      { id: 701, title: 'Best enemies-to-lovers books?', replies: 229, lastActive: '5 min ago', user: 'HopelessRomantic' },
      { id: 702, title: 'Historical romance recommendations', replies: 104, lastActive: '30 min ago', user: 'RegencyReader' },
      { id: 703, title: 'Favourite slow-burn romance 2024', replies: 188, lastActive: '15 min ago', user: 'SlowBurnLover' },
      { id: 704, title: 'Contemporary vs historical romance debate', replies: 66, lastActive: '1 hour ago', user: 'RomanceFan' },
      { id: 705, title: 'Books that made you cry happy tears', replies: 97, lastActive: '10 min ago', user: 'EmotionalReader' },
    ],
    reviewed: [
      { id: 801, title: 'Pride and Prejudice', author: 'Jane Austen', rating: 4.9, reviews: 45678, gradient: ['#800000','#4A0000'] },
      { id: 802, title: 'Outlander', author: 'Diana Gabaldon', rating: 4.7, reviews: 23456, gradient: ['#556B2F','#2E3B19'] },
      { id: 803, title: 'The Notebook', author: 'Nicholas Sparks', rating: 4.3, reviews: 34567, gradient: ['#A0522D','#5A2E1F'] },
    ],
    voiceRooms: [
      { id: 901, name: 'Romance Book Club', participants: 32, topic: 'Discussing "Pride and Prejudice"' },
      { id: 902, name: 'Trope Talk: Enemies to Lovers', participants: 21, topic: 'Favorite tropes and recommendations' },
      { id: 903, name: 'Romance Writing Circle', participants: 11, topic: 'Writing romantic scenes' },
    ],
    activeReaders: 203
  },
  'science fiction': {
    desc: 'Blast off beyond the stars. Explore futures both wondrous and terrifying, from space operas to cyberpunk dystopias and time-bending paradoxes.',
    icon: '🚀',
    color: '#154360',
    discussions: [
      { id: 1001, title: 'Asimov vs Philip K. Dick – who wins?', replies: 174, lastActive: '20 min ago', user: 'SciFiGuru' },
      { id: 1002, title: 'Best hard sci-fi novels for beginners', replies: 91, lastActive: '1 hour ago', user: 'NewToSciFi' },
      { id: 1003, title: 'Is Dune the greatest sci-fi ever written?', replies: 302, lastActive: '5 min ago', user: 'SandwormRider' },
      { id: 1004, title: 'Cyberpunk recommendations 2024', replies: 88, lastActive: '45 min ago', user: 'CyberpunkFan' },
      { id: 1005, title: 'AI in fiction – realistic or overblown?', replies: 130, lastActive: '15 min ago', user: 'TechReader' },
    ],
    reviewed: [
      { id: 1101, title: 'Dune', author: 'Frank Herbert', rating: 4.9, reviews: 34567, gradient: ['#DAA520','#8B6508'] },
      { id: 1102, title: 'Neuromancer', author: 'William Gibson', rating: 4.5, reviews: 19876, gradient: ['#154360','#0D2B3E'] },
      { id: 1103, title: 'The Martian', author: 'Andy Weir', rating: 4.7, reviews: 28765, gradient: ['#8B4513','#5A2E1F'] },
    ],
    voiceRooms: [
      { id: 1201, name: 'Sci-Fi Book Club', participants: 27, topic: 'Discussing "Dune"' },
      { id: 1202, name: 'Future Tech Talk', participants: 15, topic: 'AI and cyberpunk themes' },
      { id: 1203, name: 'Space Opera Night', participants: 19, topic: 'Favorite space operas' },
    ],
    activeReaders: 134
  },
  horror: {
    desc: 'Dare to read after dark. Confront your deepest fears through chilling supernatural tales, psychological terror, and monsters that lurk in the shadows.',
    icon: '👻',
    color: '#1B4332',
    discussions: [
      { id: 1301, title: 'Stephen King vs Shirley Jackson – best horror author?', replies: 219, lastActive: '10 min ago', user: 'HorrorFanatic' },
      { id: 1302, title: 'Scariest books you have ever read', replies: 163, lastActive: '25 min ago', user: 'BraveReader' },
      { id: 1303, title: 'Cosmic horror vs slasher fiction', replies: 87, lastActive: '1 hour ago', user: 'CosmicTerror' },
      { id: 1304, title: 'Modern horror gems of 2024', replies: 52, lastActive: '2 hours ago', user: 'NewHorror' },
      { id: 1305, title: 'Horror books that keep you up at night', replies: 201, lastActive: '5 min ago', user: 'NightReader' },
    ],
    reviewed: [
      { id: 1401, title: 'The Haunting of Hill House', author: 'Shirley Jackson', rating: 4.8, reviews: 23456, gradient: ['#2F4F4F','#000000'] },
      { id: 1402, title: 'It', author: 'Stephen King', rating: 4.6, reviews: 45678, gradient: ['#800000','#4A0000'] },
      { id: 1403, title: 'Dracula', author: 'Bram Stoker', rating: 4.5, reviews: 34567, gradient: ['#1B4332','#0A1F15'] },
    ],
    voiceRooms: [
      { id: 1501, name: 'Horror Book Club', participants: 22, topic: 'Discussing "The Haunting of Hill House"' },
      { id: 1502, name: 'True Horror Stories', participants: 16, topic: 'Real-life inspirations' },
      { id: 1503, name: 'Late Night Scares', participants: 11, topic: 'Reading horror at midnight' },
    ],
    activeReaders: 87
  },
};

// Fallback meta for genres not explicitly listed
function getGenreMeta(genreKey) {
  const cap = genreKey.charAt(0).toUpperCase() + genreKey.slice(1);
  return GENRE_META[genreKey] || {
    desc: `Explore a world of ${cap} books. Find your next great read from our curated collection.`,
    icon: '📚',
    color: '#5A2E1F',
    discussions: [
      { id: 9991, title: `Best ${cap} books of 2024?`, replies: 142, lastActive: '30 min ago', user: 'BookLover' },
      { id: 9992, title: `Underrated ${cap} authors`, replies: 89, lastActive: '1 hour ago', user: 'HiddenGems' },
      { id: 9993, title: `Top ${cap} recommendations`, replies: 115, lastActive: '15 min ago', user: 'RecommendMe' },
      { id: 9994, title: `${cap} classics you must read`, replies: 73, lastActive: '2 hours ago', user: 'ClassicReader' },
      { id: 9995, title: `New ${cap} releases this year`, replies: 58, lastActive: '45 min ago', user: 'NewReleases' },
    ],
    reviewed: [
      { id: 9996, title: 'Classic #1', author: 'Author Name', rating: 4.8, reviews: 12345, gradient: ['#4A3B32','#5A2E1F'] },
      { id: 9997, title: 'Classic #2', author: 'Another Author', rating: 4.7, reviews: 11234, gradient: ['#2C3E50','#5A2E1F'] },
      { id: 9998, title: 'Classic #3', author: 'Famous Writer', rating: 4.9, reviews: 13456, gradient: ['#5A2E1F','#3E2723'] },
    ],
    voiceRooms: [
      { id: 9999, name: `${cap} Book Club`, participants: 15, topic: `Discussing ${cap} books` },
      { id: 9990, name: `${cap} Discussion Room`, participants: 8, topic: 'General chat' },
    ],
    activeReaders: 42
  };
}

// ── State
let allBooks      = [];   // full fetched list
let displayedBooks = [];  // after filter/sort
let viewMode       = 'grid';
let currentOffset  = 0;
let totalWorks     = 0;
const PAGE_SIZE    = 20;
let genreKey       = 'fantasy';
let searchQuery    = '';
let sortOption     = 'popular';

// ── DOM refs
const genreTitleEl      = document.getElementById('genreTitle');
const genreDescEl       = document.getElementById('genreDesc');
const bookCountEl       = document.getElementById('bookCount');
const heroGenreLabelEl  = document.getElementById('heroGenreLabel');
const heroLeftTitleEl   = document.getElementById('heroBookLeftTitle');
const heroRightTitleEl  = document.getElementById('heroBookRightTitle');
const heroCenterTitleEl = document.getElementById('heroBookCenterTitle');
const bookGrid          = document.getElementById('bookGrid');
const emptyState        = document.getElementById('emptyState');
const loadMoreWrap      = document.getElementById('loadMoreWrap');
const loadMoreBtn       = document.getElementById('loadMoreBtn');
const searchInput       = document.getElementById('searchInput');
const sortSelect        = document.getElementById('sortSelect');
const gridViewBtn       = document.getElementById('gridViewBtn');
const listViewBtn       = document.getElementById('listViewBtn');
const discussionList    = document.getElementById('discussionList');
const mostReviewedList  = document.getElementById('mostReviewedList');
const voiceRoomsList    = document.getElementById('voiceRoomsList');
const activeReadersCount = document.getElementById('activeReadersCount');
const startDiscussionBtn = document.getElementById('startDiscussionBtn');
const viewAllDiscussions = document.getElementById('viewAllDiscussions');

// Mobile menu elements
const mobileToggle      = document.getElementById('mobileToggle');
const mobileMenu        = document.getElementById('mobileMenu');
const menuIconOpen      = document.getElementById('menuIconOpen');
const menuIconClose     = document.getElementById('menuIconClose');

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
function init() {
  // Read genre from URL query string
  const params = new URLSearchParams(window.location.search);
  genreKey = (params.get('type') || 'fantasy').toLowerCase();

  const displayName = toTitleCase(genreKey);

  // Update page title
  document.title = `LitLink – ${displayName} Books`;

  // Hero text
  genreTitleEl.textContent     = displayName;
  heroGenreLabelEl.textContent = displayName;

  const meta = getGenreMeta(genreKey);
  genreDescEl.textContent = meta.desc;

  // Update hero background color accent
  document.documentElement.style.setProperty('--genre-accent', meta.color);

  // Sidebar – discussions
  renderDiscussions(meta.discussions);

  // Sidebar – most reviewed
  renderMostReviewed(meta.reviewed);

  // Sidebar – voice rooms
  renderVoiceRooms(meta.voiceRooms);

  // Active readers count
  if (activeReadersCount) {
    activeReadersCount.textContent = `${meta.activeReaders} readers online now`;
  }

  // Set up navigation buttons
  setupNavigation(meta);

  // Fetch books
  fetchBooks(0);

  // Event listeners
  searchInput.addEventListener('input', debounce(() => {
    searchQuery = searchInput.value.toLowerCase().trim();
    applyFilterSort();
    renderBooks(true);
  }, 300));

  sortSelect.addEventListener('change', () => {
    sortOption = sortSelect.value;
    applyFilterSort();
    renderBooks(true);
  });

  gridViewBtn.addEventListener('click', () => setViewMode('grid'));
  listViewBtn.addEventListener('click', () => setViewMode('list'));

  loadMoreBtn.addEventListener('click', () => fetchBooks(currentOffset));

  // Mobile menu toggle
  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('open');
      if (menuIconOpen && menuIconClose) {
        menuIconOpen.style.display = isOpen ? 'none' : 'block';
        menuIconClose.style.display = isOpen ? 'block' : 'none';
      }
    });
  }
}

// Setup navigation to connected pages
function setupNavigation(meta) {
  if (startDiscussionBtn) {
    startDiscussionBtn.addEventListener('click', () => {
      window.location.href = `discussion-board.html?genre=${genreKey}&new=true`;
    });
  }

  if (viewAllDiscussions) {
    viewAllDiscussions.href = `discussion-board.html?genre=${genreKey}`;
    viewAllDiscussions.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = `discussion-board.html?genre=${genreKey}`;
    });
  }

  // Make discussion items clickable
  document.querySelectorAll('.discussion-list li a').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const discussionId = link.dataset.id;
      window.location.href = `discussion.html?id=${discussionId}&genre=${genreKey}`;
    });
  });

  // Make voice room items clickable
  document.querySelectorAll('.voice-room-item').forEach(item => {
    item.addEventListener('click', () => {
      const roomId = item.dataset.id;
      window.location.href = `voice-room.html?id=${roomId}&genre=${genreKey}`;
    });
  });
}

// ═══════════════════════════════════════════════════════════
//  FETCH from Open Library
// ═══════════════════════════════════════════════════════════
async function fetchBooks(offset) {
  if (offset === 0) showSkeletons();

  // Build API subject key (spaces → underscores, lowercase)
  const subject = genreKey.replace(/\s+/g, '_').toLowerCase();
  const url = `https://openlibrary.org/subjects/${subject}.json?limit=${PAGE_SIZE}&offset=${offset}&details=true`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();

    totalWorks = data.work_count || 0;
    bookCountEl.textContent = `${totalWorks.toLocaleString()} Books`;

    const works = data.works || [];
    const mapped = works.map((w, i) => mapWork(w, offset + i));

    allBooks = offset === 0 ? mapped : [...allBooks, ...mapped];
    currentOffset = offset + mapped.length;

    // Hero book titles from first 3 books
    if (offset === 0 && mapped.length >= 3) {
      heroLeftTitleEl.innerHTML   = wrapTitle(mapped[0].title);
      heroRightTitleEl.innerHTML  = wrapTitle(mapped[1].title);
      heroCenterTitleEl.innerHTML = wrapTitle(mapped[2].title);
    }

    applyFilterSort();
    renderBooks(offset === 0);

    // Show/hide load more
    const hasMore = currentOffset < totalWorks;
    loadMoreWrap.style.display = (hasMore && displayedBooks.length > 0) ? 'flex' : 'none';

  } catch (err) {
    console.error('Fetch error:', err);
    bookGrid.innerHTML = '<div class="error-message">Could not load books. Please check your connection.</div>';
    loadMoreWrap.style.display = 'none';
  }
}

// Map Open Library work to our book object
function mapWork(work, index) {
  const coverId   = work.cover_id || (work.cover_edition_key ? null : null);
  const gradient  = COVER_GRADIENTS[index % COVER_GRADIENTS.length];
  const coverUrl  = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null;

  // Simulate rating (in real app, this would come from our DB)
  const rating = work.ratings_average || (3.5 + Math.random() * 1.4).toFixed(1);

  return {
    key:      work.key,
    id:       work.key.split('/').pop(),
    title:    work.title || 'Unknown Title',
    author:   (work.authors && work.authors[0] && work.authors[0].name) || 'Unknown Author',
    rating:   parseFloat(rating),
    ratingCount: work.ratings_count || Math.floor(Math.random() * 5000),
    coverUrl,
    gradient,
    firstPublishYear: work.first_publish_year,
    editionCount: work.edition_count || 1,
  };
}

// ═══════════════════════════════════════════════════════════
//  FILTER + SORT
// ═══════════════════════════════════════════════════════════
function applyFilterSort() {
  let result = [...allBooks];

  // Filter
  if (searchQuery) {
    result = result.filter(b =>
      b.title.toLowerCase().includes(searchQuery) ||
      b.author.toLowerCase().includes(searchQuery)
    );
  }

  // Sort
  switch(sortOption) {
    case 'title-asc':
      result.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'title-desc':
      result.sort((a, b) => b.title.localeCompare(a.title));
      break;
    case 'rating':
      result.sort((a, b) => b.rating - a.rating);
      break;
    case 'popular':
    default:
      // Keep API order (which is usually by popularity)
      // But for consistency, we'll sort by rating count if available
      result.sort((a, b) => (b.ratingCount || 0) - (a.ratingCount || 0));
      break;
  }

  displayedBooks = result;
}

// ═══════════════════════════════════════════════════════════
//  RENDER BOOKS
// ═══════════════════════════════════════════════════════════
function renderBooks(replace = false) {
  if (displayedBooks.length === 0) {
    bookGrid.innerHTML = '';
    emptyState.style.display = 'flex';
    loadMoreWrap.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';

  const isCompact = viewMode === 'list';

  if (replace) {
    bookGrid.innerHTML = '';
    bookGrid.className = isCompact ? 'book-grid list-mode' : 'book-grid';
  }

  // Create document fragment for better performance
  const fragment = document.createDocumentFragment();

  displayedBooks.forEach((book, i) => {
    const card = isCompact ? buildCompactCard(book, i) : buildGridCard(book, i);
    fragment.appendChild(card);
  });

  bookGrid.appendChild(fragment);
}

function buildGridCard(book, i) {
  const card = document.createElement('div');
  card.className = 'book-card';
  card.dataset.bookId = book.id;
  card.dataset.bookKey = book.key;

  const coverHtml = book.coverUrl
    ? `<img src="${book.coverUrl}" alt="${escHtml(book.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
       <div class="book-cover-gradient" style="background:linear-gradient(135deg,${book.gradient[0]},${book.gradient[1]});display:none;"></div>`
    : `<div class="book-cover-gradient" style="background:linear-gradient(135deg,${book.gradient[0]},${book.gradient[1]});"></div>`;

  card.innerHTML = `
    <div class="book-cover">
      ${coverHtml}
      <div class="book-cover-overlay"></div>
      <div class="book-cover-spine"></div>
      <div class="book-cover-title-overlay">
        <span>${escHtml(book.title)}</span>
      </div>
    </div>
    <div class="book-body">
      <h3 class="book-title" title="${escHtml(book.title)}">${escHtml(truncate(book.title, 30))}</h3>
      <p class="book-author">${escHtml(truncate(book.author, 25))}</p>
      <div class="book-stars">
        <div class="stars-row">${buildStars(book.rating)}</div>
        <span class="book-rating-num">${book.rating.toFixed(1)}</span>
      </div>
      <div class="book-actions">
        <button class="btn-view" onclick="viewBook('${book.id}', '${genreKey}')">View</button>
        <button class="btn-add" onclick="addToLibrary('${book.id}', '${genreKey}')">Add</button>
      </div>
    </div>
  `;

  // Add click to view book details
  card.addEventListener('click', (e) => {
    if (!e.target.classList.contains('btn-view') && !e.target.classList.contains('btn-add')) {
      window.location.href = `book.html?id=${book.id}&genre=${genreKey}`;
    }
  });

  return card;
}

function buildCompactCard(book, i) {
  const card = document.createElement('div');
  card.className = 'book-card-compact';
  card.dataset.bookId = book.id;
  card.dataset.bookKey = book.key;

  const coverHtml = book.coverUrl
    ? `<img src="${book.coverUrl}" alt="${escHtml(book.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
       <div class="compact-cover-gradient" style="background:linear-gradient(135deg,${book.gradient[0]},${book.gradient[1]});display:none;height:100%;width:100%;"></div>`
    : `<div class="compact-cover-gradient" style="background:linear-gradient(135deg,${book.gradient[0]},${book.gradient[1]});height:100%;width:100%;"></div>`;

  card.innerHTML = `
    <div class="compact-cover">
      ${coverHtml}
      <div class="compact-cover-overlay"></div>
      <div class="compact-spine"></div>
    </div>
    <div class="compact-body">
      <h3 class="compact-title">${escHtml(truncate(book.title, 40))}</h3>
      <p class="compact-author">${escHtml(book.author)}</p>
      <div class="compact-stars">
        <div class="stars-row">${buildStars(book.rating)}</div>
        <span class="book-rating-num">${book.rating.toFixed(1)}</span>
      </div>
      <div class="compact-actions">
        <button class="btn-view" onclick="viewBook('${book.id}', '${genreKey}')">View</button>
        <button class="btn-add" onclick="addToLibrary('${book.id}', '${genreKey}')">Add</button>
      </div>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (!e.target.classList.contains('btn-view') && !e.target.classList.contains('btn-add')) {
      window.location.href = `book.html?id=${book.id}&genre=${genreKey}`;
    }
  });

  return card;
}

// ═══════════════════════════════════════════════════════════
//  SIDEBAR RENDERING
// ═══════════════════════════════════════════════════════════
function renderDiscussions(list) {
  discussionList.innerHTML = list.map(d => `
    <li>
      <a href="#" data-id="${d.id}">
        <span>${escHtml(d.title)}</span>
        <span class="reply-badge">${d.replies}</span>
      </a>
    </li>
  `).join('');

  // Add click handlers
  setTimeout(() => {
    document.querySelectorAll('.discussion-list li a').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const discussionId = link.dataset.id;
        window.location.href = `discussion.html?id=${discussionId}&genre=${genreKey}`;
      });
    });
  }, 100);
}

function renderMostReviewed(list) {
  mostReviewedList.innerHTML = list.map(b => `
    <a href="#" class="reviewed-item" data-id="${b.id}">
      <div class="reviewed-cover" style="background:linear-gradient(135deg,${b.gradient[0]},${b.gradient[1]});"></div>
      <div class="reviewed-info">
        <h3>${escHtml(truncate(b.title, 25))}</h3>
        <p class="reviewed-author">${escHtml(b.author)}</p>
        <div class="star-row">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="#C89B3C" stroke="#C89B3C" stroke-width="1">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <span>${b.rating} (${(b.reviews/1000).toFixed(1)}k reviews)</span>
        </div>
      </div>
    </a>
  `).join('');

  // Add click handlers
  setTimeout(() => {
    document.querySelectorAll('.reviewed-item').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const bookId = link.dataset.id;
        window.location.href = `book.html?id=${bookId}&genre=${genreKey}`;
      });
    });
  }, 100);
}

function renderVoiceRooms(rooms) {
  if (!voiceRoomsList) return;

  voiceRoomsList.innerHTML = rooms.map(room => `
    <div class="voice-room-item" data-id="${room.id}">
      <div class="voice-room-icon">🎧</div>
      <div class="voice-room-info">
        <h4>${escHtml(room.name)}</h4>
        <p>${room.participants} listening • ${escHtml(room.topic)}</p>
      </div>
    </div>
  `).join('');

  // Add click handlers
  setTimeout(() => {
    document.querySelectorAll('.voice-room-item').forEach(item => {
      item.addEventListener('click', () => {
        const roomId = item.dataset.id;
        window.location.href = `voice-room.html?id=${roomId}&genre=${genreKey}`;
      });
    });
  }, 100);
}

// ═══════════════════════════════════════════════════════════
//  GLOBAL FUNCTIONS (for onclick handlers)
// ═══════════════════════════════════════════════════════════
window.viewBook = function(bookId, genre) {
  window.location.href = `book.html?id=${bookId}&genre=${genre}`;
};

window.addToLibrary = function(bookId, genre) {
  // In a real app, this would call an API
  console.log(`Adding book ${bookId} to library`);
  
  // Show temporary feedback
  const btn = event.target;
  const originalText = btn.textContent;
  btn.textContent = '✓ Added!';
  btn.style.background = '#10b981';
  
  setTimeout(() => {
    btn.textContent = originalText;
    btn.style.background = '';
  }, 1500);
  
  // Here you would typically save to user's library
  // saveToUserLibrary(bookId, genre);
};

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════
function setViewMode(mode) {
  viewMode = mode;
  if (mode === 'grid') {
    gridViewBtn.classList.add('active');
    listViewBtn.classList.remove('active');
    bookGrid.className = 'book-grid';
  } else {
    listViewBtn.classList.add('active');
    gridViewBtn.classList.remove('active');
    bookGrid.className = 'book-grid list-mode';
  }
  renderBooks(true);
}

function showSkeletons() {
  bookGrid.className = 'book-grid';
  bookGrid.innerHTML = Array(6).fill('<div class="skeleton-card"></div>').join('');
  emptyState.style.display = 'none';
  loadMoreWrap.style.display = 'none';
}

function buildStars(rating) {
  let html = '';
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.3 && rating % 1 <= 0.7;
  
  for (let i = 1; i <= 5; i++) {
    if (i <= fullStars) {
      html += starSvg('#C89B3C', '#C89B3C');
    } else if (i === fullStars + 1 && hasHalfStar) {
      html += halfStarSvg('#C89B3C', '#C89B3C');
    } else {
      html += starSvg('transparent', 'rgba(253,246,227,0.2)');
    }
  }
  return html;
}

function starSvg(fill, stroke) {
  return `<svg class="star-svg" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
}

function halfStarSvg(fill, stroke) {
  return `<svg class="star-svg" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.5">
    <defs>
      <linearGradient id="halfGrad">
        <stop offset="50%" stop-color="${fill}" />
        <stop offset="50%" stop-color="transparent" />
      </linearGradient>
    </defs>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="url(#halfGrad)"/>
  </svg>`;
}

function wrapTitle(title) {
  // Split long titles for the hero book cards
  if (title.length > 12) {
    const mid = Math.ceil(title.length / 2);
    const space = title.lastIndexOf(' ', mid);
    if (space > 0) return escHtml(title.slice(0, space)) + '<br>' + escHtml(title.slice(space + 1));
  }
  return escHtml(title);
}

function truncate(str, len) {
  if (!str) return '';
  if (str.length <= len) return str;
  return str.substring(0, len - 3) + '...';
}

function toTitleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ── Boot
document.addEventListener('DOMContentLoaded', init);