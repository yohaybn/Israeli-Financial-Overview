import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import { loadTestData, hasTestData, getAvailableTestData, validateScraperResponse, countTransactions } from '../src/testHelpers.js';
import { executeFlow } from '../src/scraperFlow.js';
import fs from 'fs';
import path from 'path';

describe('Scraper Flow with Test Data', () => {
    let availableCompanies = [];

    before(() => {
        availableCompanies = getAvailableTestData();
        console.log(`Available test data for: ${availableCompanies.join(', ')}`);
    });

    describe('Test Data Loading', () => {
        it('should load test data for available companies', () => {
            availableCompanies.forEach(companyId => {
                const data = loadTestData(companyId);
                expect(data).to.be.an('array');
                expect(data.length).to.be.greaterThan(0);
            });
        });

        it('should throw error for non-existent company', () => {
            expect(() => loadTestData('nonexistent')).to.throw();
        });

        it('should correctly identify available test data', () => {
            availableCompanies.forEach(companyId => {
                expect(hasTestData(companyId)).to.be.true;
            });
            expect(hasTestData('nonexistent')).to.be.false;
        });
    });

    describe('Test Data Structure', () => {
        it('should have valid account structure', () => {
            availableCompanies.forEach(companyId => {
                const data = loadTestData(companyId);

                data.forEach(account => {
                    expect(account).to.have.property('accountNumber');
                    expect(account).to.have.property('txns');
                    expect(account.txns).to.be.an('array');
                });
            });
        });

        it('should have valid transaction structure', () => {
            availableCompanies.forEach(companyId => {
                const data = loadTestData(companyId);

                data.forEach(account => {
                    account.txns.forEach(txn => {
                        expect(txn).to.have.property('type');
                        expect(txn).to.have.property('identifier');
                        expect(txn).to.have.property('date');
                        expect(txn).to.have.property('originalAmount');
                        expect(txn).to.have.property('chargedAmount');
                        expect(txn).to.have.property('description');
                        expect(txn).to.have.property('status');
                    });
                });
            });
        });

        it('should have anonymized data', () => {
            availableCompanies.forEach(companyId => {
                const data = loadTestData(companyId);

                data.forEach(account => {
                    // Account numbers should be masked
                    expect(account.accountNumber).to.match(/^XXXX/);

                    // Descriptions should be generic
                    account.txns.forEach(txn => {
                        const desc = txn.description.toLowerCase();
                        // Should not contain Hebrew characters (anonymized)
                        expect(desc).to.not.match(/[\u0590-\u05FF]/);
                    });
                });
            });
        });
    });

    describe('Response Validation', () => {
        it('should validate successful response', () => {
            const validResponse = {
                success: true,
                data: loadTestData(availableCompanies[0])
            };

            const validation = validateScraperResponse(validResponse);
            expect(validation.valid).to.be.true;
            expect(validation.errors).to.be.empty;
        });

        it('should detect missing success field', () => {
            const invalidResponse = { data: [] };
            const validation = validateScraperResponse(invalidResponse);
            expect(validation.valid).to.be.false;
            expect(validation.errors).to.include('Missing or invalid "success" field');
        });

        it('should detect missing data field', () => {
            const invalidResponse = { success: true };
            const validation = validateScraperResponse(invalidResponse);
            expect(validation.valid).to.be.false;
        });

        it('should count transactions correctly', () => {
            const response = {
                success: true,
                data: loadTestData(availableCompanies[0])
            };

            const count = countTransactions(response);
            expect(count).to.be.a('number');
            expect(count).to.be.greaterThan(0);
        });
    });

    describe('Scraper Flow with useTestData', function () {
        this.timeout(10000); // Increase timeout for flow execution

        it('should execute flow with test data', async () => {
            if (availableCompanies.length === 0) {
                console.log('Skipping: No test data available');
                return;
            }

            const companyId = availableCompanies[0];
            const options = {
                companyId: companyId,
                credentials: { username: 'test', password: 'test' },
                useTestData: true,
                verbose: false
            };

            const result = await executeFlow(options, null);

            expect(result).to.have.property('success');
            expect(result.success).to.be.true;
            expect(result).to.have.property('data');
            expect(result.data).to.be.an('array');

            // Validate response structure
            const validation = validateScraperResponse(result);
            expect(validation.valid).to.be.true;
        });

        it('should fail gracefully for non-existent test data', async () => {
            const options = {
                companyId: 'nonexistent',
                credentials: { username: 'test', password: 'test' },
                useTestData: true
            };

            const result = await executeFlow(options, null);

            expect(result).to.have.property('success');
            expect(result.success).to.be.false;
            expect(result).to.have.property('error');
            expect(result.error).to.include('No test data found');
        });
    });
});
