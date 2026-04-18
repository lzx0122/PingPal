const PUBG_RANGES = [
  // Korea (AWS)
  "13.124.0.0/16",
  "13.125.0.0/16",
  "13.209.0.0/16",
  "52.78.0.0/16",
  "52.79.0.0/16",
  // Korea (Azure)
  "20.194.0.0/16",
  "20.196.0.0/16",
  "20.198.0.0/16",
  "20.200.0.0/16",
  "20.41.0.0/16",
  "52.231.0.0/16",
  "52.237.0.0/16",
  // Singapore (AWS - Common for SEA region)
  "13.228.0.0/16",
  "18.136.0.0/16",
  "18.138.0.0/16",
  "52.74.0.0/16",
  "52.76.0.0/16",
  "54.169.0.0/16",
  "54.251.0.0/16",
  // Japan (AWS - Common fallback)
  "13.112.0.0/16",
  "52.192.0.0/16",
  "54.248.0.0/16",
  "85.236.96.0/22",
  "103.28.54.0/24",
  "75.2.0.0/16",
  "99.77.0.0/16",
];

async function populate() {
  console.log("Starting to populate PUBG ranges...");

  for (const range of PUBG_RANGES) {
    try {
      const response = await fetch(
        "http://localhost:3000/api/games/pubg/ranges",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ipRange: range }),
        },
      );

      if (response.ok) {
        console.log(`Added/Verified: ${range}`);
      } else {
        console.error(
          `Failed to add ${range}: ${response.status} ${response.statusText}`,
        );
      }
    } catch (error) {
      console.error(`Error adding ${range}:`, error);
    }
  }

  console.log("Done.");
}

populate();
