#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/940ae0f097a9ce638e8b6d0e6590a8cb93a34222fbd6ba8ff7c5dfa8bbef7267/contract';
import endContract from '../../snapshots/940ae0f097a9ce638e8b6d0e6590a8cb93a34222fbd6ba8ff7c5dfa8bbef7267/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'demoAccount',
        columns: [
          col('accountNumber', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('balance', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('currency', 'text', {
            notNull: true,
            default: lit('USD'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('equity', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('initialBalance', 'numeric', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'demoAccount_status_check_43917f8f',
            "\"status\" IN ('ACTIVE', 'SUSPENDED', 'CLOSED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'marketPrice',
        columns: [
          col('ask', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('bid', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('last', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('source', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('symbol', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('timestamp', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'order',
        columns: [
          col('accountId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('commission', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('executedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('executedPrice', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('orderType', 'text', {
            notNull: true,
            default: lit('MARKET'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('quantity', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('requestedPrice', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('side', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('symbol', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('order_orderType_check_aa673cd1', '"orderType" IN (\'MARKET\')'),
          checkExpression('order_side_check_bd9cf7b6', "\"side\" IN ('BUY', 'SELL')"),
          checkExpression(
            'order_status_check_f663f33a',
            "\"status\" IN ('PENDING', 'FILLED', 'REJECTED', 'CANCELLED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'position',
        columns: [
          col('accountId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('averageEntryPrice', 'numeric', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('closedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('currentPrice', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('openedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('quantity', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('side', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('OPEN'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('symbol', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('unrealizedPnl', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('position_side_check_1170d616', "\"side\" IN ('LONG', 'SHORT')"),
          checkExpression('position_status_check_32214e16', "\"status\" IN ('OPEN', 'CLOSED')"),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'trade',
        columns: [
          col('accountId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('closedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('commission', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('entryPrice', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('exitPrice', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('openedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('orderId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('positionId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('quantity', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('realizedPnl', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('side', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('symbol', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('trade_side_check_bd9cf7b6', "\"side\" IN ('BUY', 'SELL')"),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'user',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('fullName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('passwordHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('role', 'text', {
            notNull: true,
            default: lit('USER'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('user_role_check_1954e8c0', "\"role\" IN ('USER', 'ADMIN')"),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'demoAccount',
        constraint: 'demoAccount_accountNumber_key',
        columns: ['accountNumber'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'user',
        constraint: 'user_email_key',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'demoAccount',
        index: 'demoAccount_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'marketPrice',
        index: 'marketPrice_symbol_timestamp_idx_524ddd3c',
        columns: ['symbol', 'timestamp'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'order',
        index: 'order_accountId_createdAt_idx_843b5d93',
        columns: ['accountId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'order',
        index: 'order_accountId_idx_cbfb3085',
        columns: ['accountId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'position',
        index: 'position_accountId_idx_cbfb3085',
        columns: ['accountId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'position',
        index: 'position_accountId_status_idx_ed560107',
        columns: ['accountId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'position',
        index: 'position_symbol_status_idx_8f05204b',
        columns: ['symbol', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'trade',
        index: 'trade_accountId_idx_cbfb3085',
        columns: ['accountId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'trade',
        index: 'trade_accountId_openedAt_idx_dfbcf78d',
        columns: ['accountId', 'openedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'trade',
        index: 'trade_orderId_idx_d284871b',
        columns: ['orderId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'trade',
        index: 'trade_positionId_idx_f0417710',
        columns: ['positionId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'demoAccount',
        foreignKey: {
          name: 'demoAccount_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'order',
        foreignKey: {
          name: 'order_accountId_fkey',
          columns: ['accountId'],
          references: { schema: 'public', table: 'demoAccount', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'position',
        foreignKey: {
          name: 'position_accountId_fkey',
          columns: ['accountId'],
          references: { schema: 'public', table: 'demoAccount', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'trade',
        foreignKey: {
          name: 'trade_accountId_fkey',
          columns: ['accountId'],
          references: { schema: 'public', table: 'demoAccount', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'trade',
        foreignKey: {
          name: 'trade_orderId_fkey',
          columns: ['orderId'],
          references: { schema: 'public', table: 'order', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'trade',
        foreignKey: {
          name: 'trade_positionId_fkey',
          columns: ['positionId'],
          references: { schema: 'public', table: 'position', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
