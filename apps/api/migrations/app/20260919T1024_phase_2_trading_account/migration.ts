#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/65fb868c362393109c6abb2cccad2bba5719278f22df317965e7b20673ab3e5e/contract';
import endContract from '../../snapshots/65fb868c362393109c6abb2cccad2bba5719278f22df317965e7b20673ab3e5e/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/940ae0f097a9ce638e8b6d0e6590a8cb93a34222fbd6ba8ff7c5dfa8bbef7267/contract';
import startContract from '../../snapshots/940ae0f097a9ce638e8b6d0e6590a8cb93a34222fbd6ba8ff7c5dfa8bbef7267/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'order',
        constraint: 'order_orderType_check_aa673cd1',
      }),
      this.addColumn({
        schema: 'public',
        table: 'demoAccount',
        column: col('commissionType', 'text', {
          notNull: true,
          default: lit('NONE'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'demoAccount',
        column: col('commissionValue', 'numeric', {
          notNull: true,
          default: lit('0'),
          codecRef: { codecId: 'pg/numeric@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'demoAccount',
        column: col('marginCallLevel', 'numeric', {
          notNull: true,
          default: lit('100'),
          codecRef: { codecId: 'pg/numeric@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'demoAccount',
        column: col('markup', 'numeric', {
          notNull: true,
          default: lit('0'),
          codecRef: { codecId: 'pg/numeric@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'demoAccount',
        column: col('maxLeverage', 'numeric', {
          notNull: true,
          default: lit('100'),
          codecRef: { codecId: 'pg/numeric@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'demoAccount',
        column: col('minimumDeposit', 'numeric', {
          notNull: true,
          default: lit('100000'),
          codecRef: { codecId: 'pg/numeric@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'demoAccount',
        column: col('minimumSpread', 'numeric', {
          notNull: true,
          default: lit('0'),
          codecRef: { codecId: 'pg/numeric@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'demoAccount',
        column: col('stopOutLevel', 'numeric', {
          notNull: true,
          default: lit('50'),
          codecRef: { codecId: 'pg/numeric@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'order',
        column: col('stopLoss', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'order',
        column: col('takeProfit', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'position',
        column: col('stopLoss', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'position',
        column: col('takeProfit', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'demoAccount',
        constraint: 'demoAccount_commissionType_check_4e288e9b',
        expression: "\"commissionType\" IN ('NONE', 'PER_LOT', 'PERCENT')",
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'order',
        constraint: 'order_orderType_check_7da144c0',
        expression: "\"orderType\" IN ('MARKET', 'BUY_LIMIT', 'SELL_LIMIT')",
      }),
      this.createIndex({
        schema: 'public',
        table: 'order',
        index: 'order_accountId_status_idx_ed560107',
        columns: ['accountId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'trade',
        index: 'trade_accountId_closedAt_idx_b4773c82',
        columns: ['accountId', 'closedAt'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
