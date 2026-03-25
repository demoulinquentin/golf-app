import { z } from "zod";
import { TRPCError } from "@trpc/server";
import jwt from "jsonwebtoken";
import { env } from "~/server/env";
import { db } from "~/server/db";

export async function verifyAuth(authToken: string) {
  try {
    const verified = jwt.verify(authToken, env.JWT_SECRET);
    const parsed = z.object({ userId: z.number() }).parse(verified);
    
    const user = await db.user.findUnique({
      where: { id: parsed.userId },
    });

    if (!user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User not found",
      });
    }

    return user;
  } catch (error) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or expired token",
    });
  }
}
