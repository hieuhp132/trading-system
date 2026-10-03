"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
require("dotenv/config");
var runtime_1 = require("@prisma/orm-postgres/runtime");
var contract_json_1 = require("../../prisma/contract.json");
var databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
}
exports.db = (0, runtime_1.default)({
    contractJson: contract_json_1.default,
    url: databaseUrl,
});
