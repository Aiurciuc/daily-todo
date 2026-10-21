import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuthRepository {
  constructor(private readonly database: DatabaseService) {}

  findUser(email: string) {
    return this.database.user.findUnique({ where: { email } });
  }

  createUserWithSession(
    name: string, email: string, passwordHash: string, tokenHash: string, expiresAt: Date,
  ) {
    return this.database.$transaction(async (transaction) => {
      const user = await transaction.user.create({ data: { name, email, passwordHash } });
      await transaction.session.create({ data: { tokenHash, userId: user.id, expiresAt } });
      return user;
    });
  }

  createSession(tokenHash: string, userId: number, expiresAt: Date) {
    return this.database.session.create({ data: { tokenHash, userId, expiresAt } });
  }

  findSession(tokenHash: string) {
    return this.database.session.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  deleteSession(tokenHash: string) {
    return this.database.session.deleteMany({ where: { tokenHash } });
  }
}
