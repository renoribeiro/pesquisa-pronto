-- CreateIndex
CREATE INDEX "dispatch_jobs_recipientId_idx" ON "dispatch_jobs"("recipientId");

-- CreateIndex
CREATE INDEX "responses_distributionId_idx" ON "responses"("distributionId");

-- CreateIndex
CREATE INDEX "responses_recipientId_idx" ON "responses"("recipientId");
