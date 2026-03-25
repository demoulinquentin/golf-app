import { randomUUID } from "crypto";
import { db } from "~/server/db";

async function setup() {
  // Backfill shareableLink for existing tournaments
  console.log("Checking for tournaments without shareable links...");
  const tournamentsWithoutLinks = await db.tournament.findMany({
    where: {
      shareableLink: null,
    },
  });

  if (tournamentsWithoutLinks.length > 0) {
    console.log(`Found ${tournamentsWithoutLinks.length} tournaments without shareable links, generating...`);
    
    for (const tournament of tournamentsWithoutLinks) {
      const shareableLink = randomUUID();
      await db.tournament.update({
        where: { id: tournament.id },
        data: { shareableLink },
      });
      console.log(`Generated shareable link for tournament ${tournament.id}: ${shareableLink}`);
    }
    
    console.log("Shareable links generated successfully");
  } else {
    console.log("All tournaments have shareable links");
  }

  // Seed game templates
  console.log("Seeding game templates...");

  // Check if templates already exist
  const existingTemplates = await db.gameTemplate.count();
  if (existingTemplates > 0) {
    console.log("Templates already exist, skipping seed");
    return;
  }

  // Traditional Stroke Play
  const strokePlayRules = await db.ruleSet.create({
    data: {
      rulesJson: {
        holes: Array.from({ length: 18 }, (_, i) => ({
          number: i + 1,
          teams: null, // individual play
          scoringMode: "strokePlay",
          handicapMode: "full",
        })),
      },
    },
  });

  await db.gameTemplate.create({
    data: {
      name: "Traditional Stroke Play",
      description: "Classic golf scoring - lowest total score wins",
      category: "popular",
      isPublic: true,
      ruleSetId: strokePlayRules.id,
      imageUrl: "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=800",
    },
  });

  // Best Ball
  const bestBallRules = await db.ruleSet.create({
    data: {
      rulesJson: {
        holes: Array.from({ length: 18 }, (_, i) => ({
          number: i + 1,
          teams: [[0, 1], [2, 3]], // 2v2 format
          scoringMode: "bestBall",
          handicapMode: "full",
        })),
      },
    },
  });

  await db.gameTemplate.create({
    data: {
      name: "Best Ball",
      description: "Team format - best score from each team counts",
      category: "team",
      isPublic: true,
      ruleSetId: bestBallRules.id,
      imageUrl: "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=800",
    },
  });

  // Scramble
  const scrambleRules = await db.ruleSet.create({
    data: {
      rulesJson: {
        holes: Array.from({ length: 18 }, (_, i) => ({
          number: i + 1,
          teams: [[0, 1, 2, 3]], // all players on one team
          scoringMode: "scramble",
          handicapMode: "team",
        })),
      },
    },
  });

  await db.gameTemplate.create({
    data: {
      name: "Scramble",
      description: "Team plays from best shot position each time",
      category: "team",
      isPublic: true,
      ruleSetId: scrambleRules.id,
      imageUrl: "https://images.unsplash.com/photo-1592919505780-303950717480?w=800",
    },
  });

  // Nassau
  const nassauRules = await db.ruleSet.create({
    data: {
      rulesJson: {
        holes: Array.from({ length: 18 }, (_, i) => ({
          number: i + 1,
          teams: null,
          scoringMode: "strokePlay",
          handicapMode: "full",
          nassauSegment: i < 9 ? "front" : "back",
        })),
      },
    },
  });

  await db.gameTemplate.create({
    data: {
      name: "Nassau",
      description: "Three separate bets: front 9, back 9, and overall",
      category: "betting",
      isPublic: true,
      ruleSetId: nassauRules.id,
      imageUrl: "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=800",
    },
  });

  // Skins Game
  const skinsRules = await db.ruleSet.create({
    data: {
      rulesJson: {
        holes: Array.from({ length: 18 }, (_, i) => ({
          number: i + 1,
          teams: null,
          scoringMode: "skins",
          handicapMode: "full",
        })),
      },
    },
  });

  await db.gameTemplate.create({
    data: {
      name: "Skins Game",
      description: "Win money on each hole with the lowest score",
      category: "betting",
      isPublic: true,
      ruleSetId: skinsRules.id,
      imageUrl: "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=800",
    },
  });

  console.log("Game templates seeded successfully");
}

setup()
  .then(() => {
    console.log("setup.ts complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
