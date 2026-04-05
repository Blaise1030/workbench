"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_sqlite_1 = require("node:sqlite");
function normalizeParams(params) {
    if (params.length === 1 && typeof params[0] === "object" && params[0] !== null && !Array.isArray(params[0])) {
        return [params[0]];
    }
    return params;
}
class StatementCompat {
    statement;
    constructor(statement) {
        this.statement = statement;
    }
    run(...params) {
        return this.statement.run(...normalizeParams(params));
    }
    get(...params) {
        return this.statement.get(...normalizeParams(params));
    }
    all(...params) {
        return this.statement.all(...normalizeParams(params));
    }
}
class BetterSqlite3Compat {
    db;
    constructor(filename) {
        this.db = new node_sqlite_1.DatabaseSync(filename);
    }
    exec(sql) {
        this.db.exec(sql);
        return this;
    }
    prepare(sql) {
        return new StatementCompat(this.db.prepare(sql));
    }
    transaction(fn) {
        return (...args) => {
            this.db.exec("BEGIN");
            try {
                fn(...args);
                this.db.exec("COMMIT");
            }
            catch (error) {
                this.db.exec("ROLLBACK");
                throw error;
            }
        };
    }
    close() {
        this.db.close();
    }
}
exports.default = BetterSqlite3Compat;
