load data11.mat

data=data';
n=length(data);


x1=zeros(n,30);
x2=zeros(n,15);


c=54;
x1(c,30)=1;
for i=1:29
    x1(c-i,30-i)=1;
end
for i=1:29
    x1(c+i,30-i)=1;
end


c=76;
x2(c,15)=1;
for i=1:14
    x2(c-i,15-i)=1;
end
for i=1:14
    x2(c+i,15-i)=1;
end

x=[x1 x2];

y=pinv(x)*data;

pre1=x1*y(1:30);
pre2=x2*y(31:45);
pre=x*y;

figure(1);
plot(1:n,data,'b-',1:n,pre1,'rs-',1:n,pre2,'mo-',1:n,pre,'kx');