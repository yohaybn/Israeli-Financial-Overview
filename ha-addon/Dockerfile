ARG BUILD_FROM
FROM $BUILD_FROM

# Install jq for parsing options in run.sh
RUN apt-get update && apt-get install -y jq && rm -rf /var/lib/apt/lists/*

# Copy the run script
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
