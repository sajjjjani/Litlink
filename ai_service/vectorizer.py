import hashlib
from typing import Dict, Any, List

# Define master lists for fixed categorical fields
MASTER_READING_HABITS = [
    "Avid Reader",
    "Casual Reader",
    "Weekend Reader",
    "Voracious Reader",
    "Occasional Reader"
]

MASTER_GENRES = [
    "Fantasy", "Mystery", "Romance", "SciFi", "Thriller", 
    "NonFiction", "Historical", "Horror", "Biography", "Poetry", "Romcom"
]

MASTER_FORMATS = [
    "Paperback",
    "Hardcover",
    "E-book",
    "Audiobook"
]

MASTER_DISCUSSION_PREFERENCES = [
    "Book Clubs",
    "Group Discussions",
    "1-on-1 Discussions",
    "No Preference"
]

# For unbounded string fields like Authors and Books, we use Feature Hashing
# to keep the vector length fixed.
HASH_BUCKETS_AUTHORS = 10
HASH_BUCKETS_BOOKS = 10

def hash_feature(items: List[str], num_buckets: int) -> List[float]:
    """Hashes a list of strings into a fixed-size vector."""
    vector = [0.0] * num_buckets
    for item in items:
        if not item:
            continue
        # Use MD5 to get a stable hash integer
        hash_val = int(hashlib.md5(item.strip().lower().encode('utf-8')).hexdigest(), 16)
        bucket = hash_val % num_buckets
        vector[bucket] += 1.0
    return vector

def convert_user_to_vector(user: Dict[str, Any]) -> List[float]:
    """
    Converts a user profile dictionary into a fixed-length numeric vector.
    Incorporates all fields from the Litlink profile page.
    """
    vector = []
    
    # 1. Reading Habit (One-hot)
    habit = user.get("readingHabit", "")
    for h in MASTER_READING_HABITS:
        vector.append(1.0 if h == habit else 0.0)
        
    # 2. Reading Goal (Numeric scalar)
    goal = user.get("readingGoal", 0)
    # We normalize reading goal slightly so it doesn't overpower the cosine similarity
    # e.g., cap at 100 and divide by 10
    normalized_goal = min(float(goal), 100.0) / 10.0
    vector.append(normalized_goal)
    
    # 3. Favorite Genres (One-hot)
    user_genres = set(user.get("favoriteGenres", []))
    for genre in MASTER_GENRES:
        vector.append(1.0 if genre in user_genres else 0.0)
        
    # 4. Preferred Formats (One-hot)
    user_formats = set(user.get("preferredFormats", []))
    for fmt in MASTER_FORMATS:
        vector.append(1.0 if fmt in user_formats else 0.0)
        
    # 5. Discussion Preferences (One-hot)
    user_disc_prefs = set(user.get("discussionPreferences", []))
    for pref in MASTER_DISCUSSION_PREFERENCES:
        vector.append(1.0 if pref in user_disc_prefs else 0.0)
        
    # 6. Favorite Authors (Feature Hashing)
    authors = user.get("favoriteAuthors", [])
    author_vector = hash_feature(authors, HASH_BUCKETS_AUTHORS)
    vector.extend(author_vector)
    
    # 7. Favorite Books (Feature Hashing)
    books = user.get("favoriteBooks", [])
    book_vector = hash_feature(books, HASH_BUCKETS_BOOKS)
    vector.extend(book_vector)
    
    # 8. Want to Read (Feature Hashing - using the same book buckets or new ones)
    # The profile has wantToRead which is an array of objects
    want_to_read = user.get("wantToRead", [])
    want_to_read_titles = [b.get("title", "") if isinstance(b, dict) else b for b in want_to_read]
    wtr_vector = hash_feature(want_to_read_titles, HASH_BUCKETS_BOOKS)
    vector.extend(wtr_vector)

    return vector

if __name__ == "__main__":
    # Sample input based on the Litlink profile page screenshot
    sample_user = {
        "readingHabit": "Avid Reader",
        "readingGoal": 10,
        "favoriteGenres": ["Horror", "Romcom"],
        "favoriteAuthors": ["Haruki Murakami"],
        "favoriteBooks": ["Frankenstein", "Defy Me"],
        "wantToRead": [
            {"title": "The Story of the Amulet"}, 
            {"title": "The Riddle of the Sands"}
        ],
        "preferredFormats": ["Paperback", "E-book"],
        "discussionPreferences": ["Book Clubs", "Group Discussions"]
    }

    import json
    print("Sample User Profile:")
    print(json.dumps(sample_user, indent=2))
    
    # Generate vector
    vector = convert_user_to_vector(sample_user)
    
    print("\nGenerated Output Vector:")
    print([round(v, 2) for v in vector])
    print(f"\nVector Length: {len(vector)} features")
