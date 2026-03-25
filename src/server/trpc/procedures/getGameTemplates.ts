import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";

export const getGameTemplates = baseProcedure.query(async () => {
  const templates = await db.gameTemplate.findMany({
    where: { isPublic: true },
    include: {
      ruleSet: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return templates;
});
