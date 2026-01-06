import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import request from 'supertest';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import scrapeRoutes from '../src/routes/scrapeRoutes.js';
import { getAvailableTestData } from '../src/testHelpers.js';

describe('API Endpoints with Test Data', () => {
    let app;
    let httpServer;
    let io;
    let availableCompanies = [];

    before(() => {
        // Setup Express app for testing
        app = express();
        httpServer = createServer(app);
        io = new Server(httpServer);

        app.set('io', io);
        app.use(express.json());
        app.use('/', scrapeRoutes);

        availableCompanies = getAvailableTestData();
        console.log(`Testing with companies: ${availableCompanies.join(', ')}`);
    });

    after(() => {
        if (httpServer) {
            httpServer.close();
        }
    });

    describe('POST /scrape with useTestData', () => {
        it('should scrape using test data', async function () {
            this.timeout(10000);

            if (availableCompanies.length === 0) {
                console.log('Skipping: No test data available');
                return;
            }

            const companyId = availableCompanies[0];

            const response = await request(app)
                .post('/scrape')
                .send({
                    companyId: companyId,
                    credentials: { username: 'test', password: 'test' },
                    useTestData: true
                })
                .expect(200);

            expect(response.body).to.have.property('success');
            expect(response.body.success).to.be.true;
            expect(response.body).to.have.property('data');
            expect(response.body.data).to.be.an('array');
        });

        it('should return error for non-existent test data', async () => {
            const response = await request(app)
                .post('/scrape')
                .send({
                    companyId: 'nonexistent',
                    credentials: { username: 'test', password: 'test' },
                    useTestData: true
                })
                .expect(500);

            expect(response.body).to.have.property('success');
            expect(response.body.success).to.be.false;
            expect(response.body).to.have.property('error');
        });

        it('should return error for missing credentials', async () => {
            const response = await request(app)
                .post('/scrape')
                .send({
                    companyId: 'isracard',
                    useTestData: true
                })
                .expect(400);

            expect(response.body).to.have.property('error');
        });

        it('should return standardized response format', async function () {
            this.timeout(10000);

            if (availableCompanies.length === 0) {
                console.log('Skipping: No test data available');
                return;
            }

            const response = await request(app)
                .post('/scrape')
                .send({
                    companyId: availableCompanies[0],
                    credentials: { username: 'test', password: 'test' },
                    useTestData: true
                })
                .expect(200);

            // Should not include verbose fields like executionLog, csv, savedFiles
            expect(response.body).to.not.have.property('executionLog');
            expect(response.body).to.not.have.property('csv');
            expect(response.body).to.not.have.property('savedFiles');

            // Should include standard fields
            expect(response.body).to.have.property('success');
            expect(response.body).to.have.property('data');
        });
    });

    describe('POST /scrape with useExisting', () => {
        it('should still support useExisting flag', async function () {
            this.timeout(10000);

            if (availableCompanies.length === 0) {
                console.log('Skipping: No test data available');
                return;
            }

            // This will fail if no existing results, but should not crash
            const response = await request(app)
                .post('/scrape')
                .send({
                    companyId: availableCompanies[0],
                    credentials: { username: 'test', password: 'test' },
                    useExisting: true
                });

            // Either succeeds or returns proper error
            expect(response.body).to.have.property('success');
            if (!response.body.success) {
                expect(response.body).to.have.property('error');
            }
        });
    });

    describe('GET /definitions', () => {
        it('should return scraper definitions', async () => {
            const response = await request(app)
                .get('/definitions')
                .expect(200);

            expect(response.body).to.be.an('object');
            // Should have company definitions from israeli-bank-scrapers
            expect(Object.keys(response.body).length).to.be.greaterThan(0);
        });
    });
});
