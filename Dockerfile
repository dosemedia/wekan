# To build image:
# docker build -t dose_wekan .

FROM node:latest

RUN mkdir /opt/wekan

ADD . /opt/wekan

EXPOSE 80

RUN npm install pm2 -g 

#&& \
#    curl https://install.meteor.com -o ./install_meteor.sh && \
    

WORKDIR /opt/wekan