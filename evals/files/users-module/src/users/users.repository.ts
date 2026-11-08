import { Injectable } from '@nestjs/common';
import { User } from './user.entity.js';

@Injectable()
export class UsersRepository {
  private readonly users: User[] = [
    { id: 1, email: 'ada@example.com', name: 'Ada', passwordHash: 'seed-hash-1' },
  ];
  private nextId = 2;

  findById(id: number): User | undefined {
    return this.users.find((u) => u.id === id);
  }

  findByEmail(email: string): User | undefined {
    return this.users.find((u) => u.email === email);
  }

  insert(data: Omit<User, 'id'>): User {
    const user = { id: this.nextId++, ...data };
    this.users.push(user);
    return user;
  }
}
