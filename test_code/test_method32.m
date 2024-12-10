load data10.mat

data=data';
n=length(data);


x1=zeros(n,50);
x2=zeros(n,37);


c=54;
x1(c,50)=1;
for i=1:49
    x1(c-i,50-i)=1;
end
for i=1:49
    x1(c+i,50-i)=1;
end


c=86;
x2(c,37)=1;
for i=1:36
    x2(c-i,37-i)=1;
end
for i=1:36
    x2(c+i,37-i)=1;
end

x=[x1 x2];

y=pinv(x)*data;

pre1=x1*y(1:50);
pre2=x2*y(51:87);
pre=x*y;

figure(2);
plot(1:n,data,'b-',1:n,pre1,'rs-',1:n,pre2,'mo-',1:n,pre,'kx');