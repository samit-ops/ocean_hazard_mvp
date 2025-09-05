from flask import Flask, request, jsonify
from transformers import AutoTokenizer, AutoModelForSequenceClassification, pipeline
from werkzeug.utils import secure_filename
import os, datetime
import tweepy
from sklearn.cluster import DBSCAN
import numpy as np
from flask_cors import CORS

# -------------------- Flask App --------------------
app = Flask(__name__)
CORS(app)  # allow cross-origin requests

# -------------------- Sentiment Analysis Setup --------------------
MODEL = "cardiffnlp/twitter-roberta-base-sentiment"
print("⏳ Loading sentiment model...")
tokenizer = AutoTokenizer.from_pretrained(MODEL)
model = AutoModelForSequenceClassification.from_pretrained(MODEL)
sentiment_pipeline = pipeline("sentiment-analysis", model=model, tokenizer=tokenizer)
print("✅ Sentiment model loaded.")

# -------------------- File Upload Setup --------------------
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

# -------------------- Twitter API Setup --------------------
BEARER_TOKEN = "AAAAAAAAAAAAAAAAAAAAAOPn3wEAAAAAk3MRUsn1lDiQ6k8zwcOdId4gGQ4%3DPkiwWtscERQosnATcFtzEKl0AVymIYn7L29X5fFeS7caT9Dmej"
client = tweepy.Client(bearer_token=BEARER_TOKEN)

# -------------------- Hazard / Severity --------------------
def is_hazard(text):
    keywords = ["flood", "storm", "cyclone", "earthquake", "landslide", "tsunami", "quake"]
    return any(k in text.lower() for k in keywords)

def get_severity(text):
    text = text.lower()
    if any(w in text for w in ["emergency", "help", "urgent"]):
        return "high"
    if any(w in text for w in ["alert", "warning", "rain"]):
        return "medium"
    return "low"

# -------------------- Fetch Tweets Robustly --------------------
def fetch_tweets(query="flood", max_results=10):
    tweets = []
    try:
        resp = client.search_recent_tweets(
            query=f"{query} -is:retweet has:geo",
            tweet_fields=["geo", "text"],
            expansions=["geo.place_id"],
            place_fields=["geo"],
            max_results=max_results
        )

        if not resp.data:
            return []

        place_map = {}
        if getattr(resp, "includes", None) and "places" in resp.includes:
            for place in resp.includes["places"]:
                place_map[place["id"]] = place

        for tweet in resp.data:
            if not is_hazard(tweet.text):
                continue

            lat, lng = None, None
            if tweet.geo and getattr(tweet.geo, "place_id", None):
                place = place_map.get(tweet.geo.place_id)
                if place and getattr(place, "geo", None) and "bbox" in place.geo:
                    bbox = place.geo["bbox"]
                    lat = (bbox[1] + bbox[3]) / 2
                    lng = (bbox[0] + bbox[2]) / 2

            if lat is None or lng is None:
                continue

            tweets.append({
                "text": tweet.text,
                "lat": lat,
                "lng": lng,
                "severity": get_severity(tweet.text)
            })

    except Exception as e:
        print("⚠️ Error fetching tweets:", e)

    return tweets

# -------------------- Cluster Tweets into Hotspots --------------------
def cluster_tweets(tweets):
    if not tweets:
        return []

    coords = np.array([[t["lat"], t["lng"]] for t in tweets])
    if len(coords) < 2:
        # Return single points as hotspots
        return [{"lat": t["lat"], "lng": t["lng"], "severity": t["severity"], "count": 1} for t in tweets]

    clustering = DBSCAN(eps=1.5, min_samples=2).fit(coords)
    labels = clustering.labels_
    hotspots = []

    for cid in set(labels):
        if cid == -1:
            # Noise points, treat as individual hotspots
            for i, lbl in enumerate(labels):
                if lbl == -1:
                    hotspots.append({
                        "lat": tweets[i]["lat"],
                        "lng": tweets[i]["lng"],
                        "severity": tweets[i]["severity"],
                        "count": 1
                    })
            continue

        pts = [tweets[i] for i in range(len(tweets)) if labels[i] == cid]
        avg_lat = float(np.mean([p["lat"] for p in pts]))
        avg_lng = float(np.mean([p["lng"] for p in pts]))
        counts = len(pts)
        severities = [p["severity"] for p in pts]

        # Cluster severity by majority
        if severities.count("high") >= max(severities.count("medium"), severities.count("low")):
            severity = "high"
        elif severities.count("medium") >= severities.count("low"):
            severity = "medium"
        else:
            severity = "low"

        hotspots.append({
            "lat": avg_lat,
            "lng": avg_lng,
            "severity": severity,
            "count": counts
        })
    return hotspots

# -------------------- Routes --------------------
@app.route('/')
def home():
    return "<h2>Flask Backend Running ✅</h2><p>Routes:<br>/analyze-sentiment (POST)<br>/upload (POST)<br>/get-hotspots (GET)</p>"

# 1️⃣ Sentiment Analysis
@app.route('/analyze-sentiment', methods=['POST'])
def analyze_sentiment():
    data = request.json
    text = data.get("text", "")
    if not text:
        return jsonify({"error": "No text provided"}), 400
    result = sentiment_pipeline(text)[0]
    return jsonify(result)

# 2️⃣ File Upload
@app.route("/upload", methods=["POST"])
def upload_file():
    if "photo" not in request.files:
        return jsonify({"error": "No photo uploaded"}), 400

    file = request.files["photo"]
    if file.filename == "":
        return jsonify({"error": "Empty file name"}), 400

    title = request.form.get("title", "")
    hazard_type = request.form.get("type", "")
    desc = request.form.get("desc", "")
    lat = request.form.get("latitude", "")
    lng = request.form.get("longitude", "")

    filename = secure_filename(file.filename)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    save_path = os.path.join(app.config["UPLOAD_FOLDER"], f"{timestamp}_{filename}")
    file.save(save_path)

    sentiment_result = sentiment_pipeline(desc)[0] if desc else {}

    return jsonify({
        "message": "Report submitted ✅",
        "title": title,
        "type": hazard_type,
        "desc": desc,
        "lat": lat,
        "lng": lng,
        "photo": save_path,
        "sentiment": sentiment_result
    })

# 3️⃣ Twitter Hotspots
@app.route("/get-hotspots", methods=["GET"])
def get_hotspots():
    query = request.args.get("q", "flood")
    tweets = fetch_tweets(query=query, max_results=50)

    if not tweets:
        # optional dummy hotspot for testing
        return jsonify([
            {"lat": 19.07, "lng": 72.87, "severity": "high", "count": 1},
            {"lat": 18.96, "lng": 72.82, "severity": "medium", "count": 1}
        ])

    hotspots = cluster_tweets(tweets)
    return jsonify(hotspots)

# -------------------- Run Server --------------------
if __name__ == "__main__":
    app.run(debug=True)
