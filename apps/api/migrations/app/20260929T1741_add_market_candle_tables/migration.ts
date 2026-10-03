#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/65fb868c362393109c6abb2cccad2bba5719278f22df317965e7b20673ab3e5e/contract';
import startContract from '../../snapshots/65fb868c362393109c6abb2cccad2bba5719278f22df317965e7b20673ab3e5e/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/90a7a18ff9a769ba5b0a593a6c7e4aef3823809bd1e9cef5c9293718adc3b372/contract';
import endContract from '../../snapshots/90a7a18ff9a769ba5b0a593a6c7e4aef3823809bd1e9cef5c9293718adc3b372/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'historicalMarketCandleFull',
        columns: [
          col('close', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('high', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('interval', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('low', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('open', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('receivedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('source', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('symbol', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('time', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'marketCandle',
        columns: [
          col('close', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('high', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('interval', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('low', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('open', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('receivedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('source', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('symbol', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('time', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'historicalMarketCandleFull',
        constraint: 'historicalMarketCandleFull_symbol_interval_time_key',
        columns: ['symbol', 'interval', 'time'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'marketCandle',
        constraint: 'marketCandle_symbol_interval_time_key',
        columns: ['symbol', 'interval', 'time'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'historicalMarketCandleFull',
        index: 'historicalMarketCandleFull_symbol_interval_time_idx_a5363bcd',
        columns: ['symbol', 'interval', 'time'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'marketCandle',
        index: 'marketCandle_symbol_interval_time_idx_a5363bcd',
        columns: ['symbol', 'interval', 'time'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
