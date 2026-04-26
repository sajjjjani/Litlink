import numpy as np
from sklearn.neighbors import NearestNeighbors
from typing import List, Dict, Any
from vectorizer import convert_user_to_vector

# Global variables to store the model and mapping
_trained_model = None
_user_ids_mapping = []

def trainModel(users: List[Dict[str, Any]]) -> bool:
    """
    Accepts a list of users, converts them to vectors, and trains the KNN model.
    """
    global _trained_model, _user_ids_mapping
    
    if not users:
        print("Warning: No users provided for training.")
        return False

    user_ids = []
    vectors = []

    for user in users:
        # Prefer '_id' for MongoDB, fallback to 'id'
        user_id = str(user.get("_id", user.get("id")))
        if not user_id or user_id == "None":
            continue
            
        vector = convert_user_to_vector(user)
        user_ids.append(user_id)
        vectors.append(vector)

    if not vectors:
        print("Warning: No valid vectors created.")
        return False

    # Store mapping
    _user_ids_mapping = user_ids

    # Convert to numpy array
    X = np.array(vectors)

    # Handle small datasets gracefully:
    # Set n_neighbors = 5 as requested, but cap to dataset size
    n_neighbors = 5
    actual_neighbors = min(n_neighbors + 1, len(vectors))
    
    if actual_neighbors == 0:
        return False

    # Initialize and train NearestNeighbors
    _trained_model = NearestNeighbors(n_neighbors=actual_neighbors, metric="cosine")
    _trained_model.fit(X)
    
    print(f"Model trained successfully on {len(vectors)} users.")
    return True

def findMatches(userVector: List[float], current_user_id: str = None) -> List[Dict[str, Any]]:
    """
    Takes a user vector and returns the top matches with similarity scores.
    """
    global _trained_model, _user_ids_mapping
    
    if _trained_model is None or not _user_ids_mapping:
        raise ValueError("Model is not trained yet.")

    n_neighbors = 20
    request_neighbors = min(n_neighbors + 1, len(_user_ids_mapping))

    # Convert input to numpy array and reshape to 2D
    X_query = np.array([userVector])

    # Find neighbors (distances and indices)
    distances, indices = _trained_model.kneighbors(X_query, n_neighbors=request_neighbors)

    matches = []
    for dist, idx in zip(distances[0], indices[0]):
        matched_id = _user_ids_mapping[idx]
        
        # Skip if it's the same user
        if current_user_id and matched_id == str(current_user_id):
            continue
            
        # Cosine distance to similarity: similarity = 1 - distance
        similarity = 1.0 - dist
        # Convert to percentage
        score = round(max(0, similarity) * 100, 2)
        
        matches.append({
            "userId": matched_id,
            "score": score
        })

    # Sort descending by score
    matches.sort(key=lambda x: x["score"], reverse=True)
    return matches[:n_neighbors]

if __name__ == "__main__":
    # Sample users matching the Litlink profile schema
    db_users = [
        {
            "_id": "user1",
            "readingHabit": "Avid Reader",
            "readingGoal": 50,
            "favoriteGenres": ["Fantasy", "SciFi"],
            "favoriteAuthors": ["Brandon Sanderson", "Frank Herbert"],
            "preferredFormats": ["Hardcover", "Audiobook"],
            "discussionPreferences": ["Book Clubs"]
        },
        {
            "_id": "user2",
            "readingHabit": "Avid Reader",
            "readingGoal": 45,
            "favoriteGenres": ["Fantasy", "Romance"],
            "favoriteAuthors": ["Sarah J. Maas", "Brandon Sanderson"],
            "preferredFormats": ["Hardcover", "Paperback"],
            "discussionPreferences": ["Book Clubs", "Group Discussions"]
        },
        {
            "_id": "user3",
            "readingHabit": "Occasional Reader",
            "readingGoal": 5,
            "favoriteGenres": ["NonFiction", "Biography"],
            "favoriteAuthors": ["Walter Isaacson"],
            "preferredFormats": ["Audiobook"],
            "discussionPreferences": ["1-on-1 Discussions"]
        },
        {
            "_id": "user4",
            "readingHabit": "Casual Reader",
            "readingGoal": 15,
            "favoriteGenres": ["Mystery", "Thriller"],
            "favoriteAuthors": ["Agatha Christie", "Gillian Flynn"],
            "preferredFormats": ["Paperback", "E-book"],
            "discussionPreferences": ["No Preference"]
        }
    ]

    # Train
    print("Training model...")
    trainModel(db_users)
    
    # Test Match for User 1
    print("\n--- Finding Matches for User 1 ---")
    u1_vector = convert_user_to_vector(db_users[0])
    
    # We pass current_user_id="user1" so they don't match with themselves
    matches = findMatches(u1_vector, current_user_id="user1")
    
    for match in matches:
        print(f"Match: {match['userId']} | Compatibility Score: {match['score']}%")

